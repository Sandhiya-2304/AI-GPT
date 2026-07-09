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

console.log("CHAT DEPLOYMENT:", process.env.AZURE_OPENAI_DEPLOYMENT);
console.log("IMAGE DEPLOYMENT:", process.env.IMAGE_DEPLOYMENT);
console.log("VIDEO DEPLOYMENT:", process.env.VIDEO_DEPLOYMENT);
console.log("API VERSION:", process.env.AZURE_OPENAI_API_VERSION);

/* ================= CHAT AI ================= */
async function getAIResponse(message, userId = null) {
  try {
    let previousContext = "";
    
    if (userId) {
      const { getRecentUserContext } = require("./cosmosClient");
      previousContext = await getRecentUserContext(userId, message);
    }
    
    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      messages: [
        {
          role: "system",
          content: `
🧠 YOU ARE A REAL AI ASSISTANT with ULTRA SUPER MEMORY (like ChatGPT-4 with infinite memory).

${previousContext ? previousContext : 'No previous context available.'}

⚡ ULTRA MEMORY POWERS:
1. You KNOW ALL topics user discussed in PREVIOUS CHATS
2. You can connect NEW questions to OLD discussions
3. You remember EXACT details from previous conversations
4. You understand context across MULTIPLE chat sessions

🎯 RESPONSE RULES:
- "more details" = AUTOMATICALLY expand on TOPIC #1 (most recent)
- "tell me more" = AUTOMATICALLY give MORE about last topic
- "explain [topic]" = Explain in DETAIL (check if discussed before)
- Questions = Direct, clear answer (2-4 sentences)
- "thank you"/"super"/"cute" = Short warm response (2-3 sentences)
- Incomplete sentences = SMART GUESS + answer properly
- Reply in plain text only.
- Do not use markdown.
- Do not use headings, bold, italics, bullets, or code blocks.
- Keep replies short and clean.
- If context is provided, use it naturally.
- For simple questions, answer in 1-2 short sentences.

⚡ STYLE:
- NATURAL human conversation (not robotic)
- SHORT but complete (2-4 sentences unless explaining)
- FRIENDLY but professional
- NEVER: "feel free", "let me know", "explore further"
- ALWAYS: "Sure!", "Here's what I know", "Great question!"

📝 CURRENT MESSAGE: "${message}"

🎯 RESPOND SMARTLY using your ULTRA MEMORY!
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
      text: content || "No response",
      mediaUrl: null
    };
  } catch (error) {
    console.error("AI response error:", error);
    return {
      type: "chat",
      text: "I'm having trouble responding right now. Please try again.",
      mediaUrl: null
    };
  }
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

    if (!base64) {
      return {
        success: false,
        error: "No image generated"
      };
    }

    const binaryData = Buffer.from(base64, "base64");
    const fileName = `${uuidv4()}.png`;
    const imageUrl = await uploadImage(binaryData, fileName);

    return {
      success: true,
      mediaUrl: imageUrl,
      type: 'image',
      answer: 'Image generated successfully'
    };
  } catch (error) {
    console.error("IMAGE ERROR:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/* ================= VIDEO GENERATION ================= */
async function generateVideo(prompt) {
  try {
    console.log("Generating video:", prompt);

    const endpoint = process.env.VIDEO_ENDPOINT;
    const apiKey = process.env.VIDEO_KEY;
    const deploymentName = process.env.VIDEO_DEPLOYMENT;

    if (!endpoint || !apiKey || !deploymentName) {
      return {
        success: false,
        error: "VIDEO_ENDPOINT, VIDEO_KEY, and VIDEO_DEPLOYMENT must be set"
      };
    }

    let seconds = "4";
    let size = "720x1280";

    const secondsMatch = prompt.match(/(\d+)\s*(seconds?|s)\b/i);
    if (secondsMatch) {
      const requestedSeconds = secondsMatch[1];
      const validSeconds = ["4", "8", "12"];
      if (!validSeconds.includes(requestedSeconds)) {
        return {
          success: false,
          error: `Seconds must be 4, 8, or 12. You specified: ${requestedSeconds}`
        };
      }
      seconds = requestedSeconds;
    }

    const sizeMatch = prompt.match(/\b(720x1280|1280x720|1024x1792|1792x1024)\b/i);
    if (sizeMatch) {
      size = sizeMatch[1];
    }

    let cleanPrompt = prompt;
    if (secondsMatch) cleanPrompt = cleanPrompt.replace(secondsMatch[0], "");
    if (sizeMatch) cleanPrompt = cleanPrompt.replace(sizeMatch[0], "");
    cleanPrompt = cleanPrompt.trim();

    console.log(`📊 Video params -> seconds: ${seconds}, size: ${size}`);
    console.log(`📝 Prompt: ${cleanPrompt}`);

    const createUrl = `${endpoint}/openai/v1/videos`;
    const createBody = {
      model: deploymentName,
      prompt: cleanPrompt,
      seconds,
      size
    };

    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-key": apiKey
      },
      body: JSON.stringify(createBody)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return {
        success: false,
        error: errorText
      };
    }

    const createData = await createResponse.json();
    const videoId = createData.id;

    if (!videoId) {
      return {
        success: false,
        error: "Video job id was not returned"
      };
    }

    console.log("🎬 Video job created:", videoId);

    const statusUrl = `${endpoint}/openai/v1/videos/${videoId}`;

    while (true) {
      const statusResponse = await fetch(statusUrl, {
        headers: { "Api-key": apiKey }
      });

      if (!statusResponse.ok) {
        console.log("⚠️ Status check failed, retrying...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      const statusData = await statusResponse.json();
      console.log("📊 Status:", statusData.status);

      if (statusData.status === "completed") {
        const downloadUrl = `${endpoint}/openai/v1/videos/${videoId}/content?variant=video`;

        const videoResponse = await fetch(downloadUrl, {
          headers: { "Api-key": apiKey }
        });

        if (!videoResponse.ok) {
          const errorText = await videoResponse.text();
          return {
            success: false,
            error: `Failed to download video: ${errorText}`
          };
        }

        const arrayBuffer = await videoResponse.arrayBuffer();
        const binaryData = Buffer.from(arrayBuffer);
        const fileName = `${uuidv4()}.mp4`;
        const blobVideoUrl = await uploadVideo(binaryData, fileName);

        return {
          success: true,
          mediaUrl: blobVideoUrl,
          type: "video",
          answer: `Video generated successfully (${seconds}s, ${size})`
        };
      }

      if (statusData.status === "failed" || statusData.status === "cancelled") {
        return {
          success: false,
          error: statusData.error || `Video generation ${statusData.status}`
        };
      }

      console.log("⏳ Video still processing...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error("VIDEO ERROR:", error);
    return {
      success: false,
      error: error.message
    };
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