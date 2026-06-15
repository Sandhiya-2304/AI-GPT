
require("dotenv").config();
const { AzureOpenAI } = require("openai");
const { uploadImage, uploadVideo } = require("./blobstorage");
const { v4: uuidv4 } = require("uuid");

/* ================= Azure OpenAI Clients ================= */
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
});

const imageClient = new AzureOpenAI({
  apiKey: process.env.IMAGE_KEY,
  endpoint: process.env.IMAGE_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
});

const videoClient = new AzureOpenAI({
  apiKey: process.env.VIDEO_KEY,
  endpoint: process.env.VIDEO_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
});

console.log("CHAT DEPLOYMENT:", process.env.AZURE_OPENAI_DEPLOYMENT);
console.log("IMAGE DEPLOYMENT:", process.env.IMAGE_DEPLOYMENT);
console.log("VIDEO DEPLOYMENT:", process.env.VIDEO_DEPLOYMENT);
console.log("API VERSION:", process.env.AZURE_OPENAI_API_VERSION);

/* ================= CHAT AI ================= */
async function getAIResponse(message) {
  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      {
        role: "system",
        content: `
You are a helpful AI assistant.
- Respond clearly and concisely.
- Do NOT generate images or videos unless explicitly requested.
- If user asks for image/video, only describe or wait for system handling.
`.trim()
      },
      {
        role: "user",
        content: message
      }
    ],
    temperature: 0.2,
  });

  const content = response.choices[0].message.content;

  return {
    type: "chat",
    text: content || "No response"
  };
}

/* ================= IMAGE GENERATION ================= */
async function generateImage(prompt) {
  try {
    console.log("Generating image:", prompt);

    const result = await imageClient.images.generate({
      model: process.env.IMAGE_DEPLOYMENT,
      prompt,
      size: "1024x1024"
    });

    const base64 = result?.data?.[0]?.b64_json;

    if (!base64) return null;

    // Convert base64 to buffer
    const binaryData = Buffer.from(base64, "base64");
    const fileName = `${uuidv4()}.png`;

    // Upload to Azure Blob Storage
    const imageUrl = await uploadImage(binaryData, fileName);

    return imageUrl;  // Return Blob URL
  } catch (error) {
    console.error("IMAGE ERROR:", error);
    return null;
  }
}

/* ================= VIDEO GENERATION ================= */
async function generateVideo(prompt) {
  try {
    console.log("Generating video:", prompt);

    // Direct POST to Sora-2 API (no SDK needed)
    const response = await fetch(
      `${process.env.VIDEO_ENDPOINT}/openai/v1/videos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.VIDEO_KEY
        },
        body: JSON.stringify({
          model: process.env.VIDEO_DEPLOYMENT,
          prompt: prompt,
          size: "1280x720",
          seconds: "5"
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("VIDEO API ERROR:", errorText);
      return null;
    }

    const data = await response.json();
    console.log("VIDEO RESULT:", JSON.stringify(data, null, 2));

    // Get video URL from response
    const videoUrl = data?.data?.[0]?.url || data?.url || null;

    if (!videoUrl) {
      console.error("No video URL in response");
      return null;
    }

    // Download video from Azure URL
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      console.error("Failed to download video");
      return null;
    }

    const arrayBuffer = await videoResponse.arrayBuffer();
    const binaryData = Buffer.from(arrayBuffer);
    const fileName = `${uuidv4()}.mp4`;

    // Upload to your Azure Blob Storage
    const blobVideoUrl = await uploadVideo(binaryData, fileName);

    return blobVideoUrl;  // Return your Blob URL
  } catch (error) {
    console.error("VIDEO ERROR:");
    console.error(error);
    return null;
  }
}

/* ================= CHAT TITLE ================= */
async function generateChatTitle(firstMessage) {
  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      {
        role: "system",
        content: "Generate a short chat title (max 5 words). Return only text."
      },
      {
        role: "user",
        content: firstMessage
      }
    ],
    temperature: 0.3,
    max_tokens: 20
  });

  return response.choices[0].message.content.trim();
}

module.exports = {
  getAIResponse,
  generateImage,
  generateVideo,
  generateChatTitle
};