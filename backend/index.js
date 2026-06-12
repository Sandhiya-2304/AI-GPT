require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { generateVideo } = require("./openai");
const {
  getAIResponse,
  executeAIAction,
  generateImage
} = require("./openai");

const { uploadImage } = require("./blobStorage");

const {
  saveMessageToCosmos,
  getMessagesFromCosmos,
  getSidebarThreads,
  deleteChatThread
} = require("./cosmosClient");

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

/* ================= IMAGE INTENT ================= */
const isImageIntent = (text = "") => {
  const t = text.toLowerCase();
  return (
    t.includes("image") ||
    t.includes("picture") ||
    t.includes("photo") ||
    t.includes("draw") ||
    t.includes("generate") ||
    t.includes("create") ||
    t.includes("art") ||
    t.includes("wallpaper")
  );
};
const isVideoIntent = (text = "") => {
  const t = text.toLowerCase();
  return (
    t.includes("video") ||
    t.includes("animate") ||
    t.includes("motion") ||
    t.includes("clip") ||
    t.includes("movie") ||
    t.includes("cinematic")
  );
};

function getVideo(prompt) {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = prompt.charCodeAt(i) + ((hash << 5) - hash);
  }
  return videoSamples[Math.abs(hash) % videoSamples.length];
}
/* ================= CHAT API ================= */
app.post("/api/chat", async (req, res) => {
  const { message, chatId, userId, token } = req.body;

  if (!message || !chatId || !userId) {
    return res.status(400).json({
      success: false,
      error: "message, chatId and userId required"
    });
  }

  try {
    /* ================= SAVE USER MESSAGE ================= */
    await saveMessageToCosmos(
      chatId,
      userId,
      "user",
      message,
      "text"
    );

    /* ================= IMAGE FLOW ================= */
 /* ================= IMAGE FLOW ================= */
if (isImageIntent(message)) {
  const prompt = message.replace(/\/image/i, "").trim();

  const base64Image = await generateImage(prompt);

  const cleanBase64 = base64Image.replace(
    /^data:image\/\w+;base64,/,
    ""
  );

  const buffer = Buffer.from(cleanBase64, "base64");

  const fileName = `${Date.now()}_${userId}.png`;

  const imageUrl = await uploadImage(buffer, fileName);

  await saveMessageToCosmos(
    chatId,
    userId,
    "assistant",
    null,
    "image",
    imageUrl
  );

  return res.json({
    success: true,
    type: "image",
    mediaUrl: imageUrl,
    mediaType: "image"
  });
}
/* ================= VIDEO FLOW ================= */
if (isVideoIntent(message)) {
  const prompt = message.replace(/\/video/i, "").trim();

  const videoUrl = await generateVideo(prompt);

  if (!videoUrl) {
    return res.json({
      success: false,
      type: "chat",
      answer: "Video generation is not available in your Azure setup."
    });
  }

  await saveMessageToCosmos(
    chatId,
    userId,
    "assistant",
    null,
    "video",
    videoUrl
  );

  return res.json({
    success: true,
    type: "video",
    mediaUrl: videoUrl,
    answer: "Here is your generated video"
  });
} 
    /* ================= CHAT HISTORY CONTEXT ================= */
    const history = await getMessagesFromCosmos(chatId, userId);

    const context = history
  .map((m) => {
    if (m.contentType === "image") return `${m.sender}: [Image]`;
    if (m.contentType === "video") return `${m.sender}: [Video]`;
    return `${m.sender}: ${m.message || ""}`;
  })
  .join("\n");

    const contextMessage =
      history.length > 0
        ? `Previous conversation:\n${context}\n\nUser: ${message}`
        : message;

    /* ================= AI RESPONSE ================= */
    console.log("Contextmessage",contextMessage);
    
    const aiResponse = await getAIResponse(contextMessage, token);
console.log("Ai resposne",aiResponse);

    const finalResponse = await executeAIAction(
      aiResponse,
      message,
      history,
      token
    );

    const aiText =
      finalResponse.type === "chat"
        ? finalResponse.text
        : "I processed your request.";

    /* ================= SAVE TEXT RESPONSE ================= */
    await saveMessageToCosmos(
      chatId,
      userId,
      "assistant",
      aiText,
      "text"
    );

    return res.json({
      success: true,
      type: "chat",
      answer: aiText
    });

  } catch (error) {
    console.error("Chat Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

/* ================= CHAT HISTORY ================= */
app.post("/api/chat/history", async (req, res) => {
  const { chatId, userId } = req.body;

  try {
    const messages = await getMessagesFromCosmos(chatId, userId);

    const normalized = messages.map((m, index) => ({
  id: `${chatId}_${index}`,
  role: m.sender === "user" ? "user" : "bot",
  contentType: m.contentType,
  text: m.contentType === "text" ? m.message : "",
  mediaUrl: m.mediaUrl || null
}));

    return res.json({
      success: true,
      messages: normalized
    });

  } catch (error) {
    console.error("History Load Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load history"
    });
  }
});

/* ================= THREADS ================= */
app.get("/api/history/threads", async (req, res) => {
  const { userId } = req.query;

  const threads = await getSidebarThreads(userId);

  res.json({
    success: true,
    threads
  });
});

/* ================= DELETE CHAT ================= */
app.delete("/api/chat/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.query;

  const deleted = await deleteChatThread(chatId, userId);

  res.json({ success: deleted });
});

/* ================= SERVER ================= */
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});