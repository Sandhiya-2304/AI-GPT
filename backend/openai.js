require("dotenv").config();
const { AzureOpenAI } = require("openai");

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
  baseURL: process.env.VIDEO_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
});


/* ================= CHAT AI ================= */
async function getAIResponse(message) {
  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      {
        role: "system",
        content: `
You are a chat assistant.

Return ONLY JSON:

1. chat:
{ "type": "chat", "text": "..." }



2. video:
{ "type": "video", "prompt": "..." }
        `.trim()
      },
      {
        role: "user",
        content: message
      }
    ],
    temperature: 0.2,
  });

  let content = response.choices[0].message.content;
  content = content.replace(/```json|```/g, "").trim();

 try {
  return JSON.parse(content);
} catch (err) {
  console.log("Invalid JSON from AI:", content);

  return {
    type: "chat",
    text: content || "I couldn't process that request."
  };
}
}

/* ================= IMAGE GENERATION ================= */
async function generateImage(prompt) {
  const result = await imageClient.images.generate({
    model: process.env.IMAGE_DEPLOYMENT,
    prompt,
    size: "1024x1024"
  });

  return result.data[0].b64_json;
}

/* ================= VIDEO GENERATION ================= */
/* ⚠️ depends on Azure support */
console.log("deployment name",process.env.VIDEO_DEPLOYMENT);
async function generateVideo(prompt) {
  try {
    const result = await videoClient.responses.create({
      model: process.env.VIDEO_DEPLOYMENT, // sora-2
      input: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    // extract video output (depends on Azure response format)
    const output = result.output?.[0];

    return (
      output?.url ||
      output?.content?.[0]?.url ||
      output?.b64_json ||
      null
    );
  } catch (error) {
    console.error("VIDEO GENERATION ERROR:", error);
    return null;
  }
}
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