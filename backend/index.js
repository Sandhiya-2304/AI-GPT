
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { saveMessageToCosmos, getMessagesFromCosmos, getSidebarThreads, deleteChatThread } = require("./cosmosClient");
const { generateChatTitle, generateImage, generateVideo } = require("./openai");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    const { message, chatId, userId } = req.body;

    if (!message || !chatId || !userId) {
      return res.status(400).json({ success: false, error: "message, chatId, userId required" });
    }

    await saveMessageToCosmos(chatId, userId, "user", message, "text");

    if (message.startsWith("/image")) {
      const prompt = message.replace("/image", "").trim();
      const imageUrl = await generateImage(prompt);

      if (!imageUrl) {
        return res.status(500).json({ success: false, error: "Image generation failed" });
      }

      await saveMessageToCosmos(chatId, userId, "assistant", "Image generated", "image", imageUrl);
      return res.json({ success: true, type: "image", mediaUrl: imageUrl, answer: "Image generated" });
    }

    if (message.startsWith("/video")) {
      const prompt = message.replace("/video", "").trim();
      const videoUrl = await generateVideo(prompt);

      if (!videoUrl) {
        return res.status(500).json({ success: false, error: "Video generation failed" });
      }

      await saveMessageToCosmos(chatId, userId, "assistant", "Video generated", "video", videoUrl);
      return res.json({ success: true, type: "video", mediaUrl: videoUrl, answer: "Video generated" });
    }

    return res.json({ success: true, answer: "Message received" });
  } catch (error) {
    console.error("/api/chat error:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});
// Remove or replace /api/edit-image with this fixed version:
app.post("/api/edit-image", async (req, res) => {
  const { prompt, imageUrl, userId, chatId } = req.body;

  if (!prompt || !imageUrl || !userId || !chatId) {
    return res.status(400).json({
      success: false,
      error: "prompt, imageUrl, userId and chatId are required"
    });
  }

  try {
    // Use your IMAGE model (gpt-image-1.5), NOT sora-2
    const response = await fetch(
      `${process.env.IMAGE_ENDPOINT}/openai/v1/images/edits?api-version=${process.env.AZURE_OPENAI_API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.IMAGE_KEY
        },
        body: JSON.stringify({
          model: process.env.IMAGE_DEPLOYMENT,  // Use gpt-image-1.5
          prompt,
          image_url: imageUrl
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Azure edit-image error:", text);
      return res.status(response.status).json({
        success: false,
        error: "Image edit failed"
      });
    }

    const data = await response.json();
    const editedUrl = data?.data?.[0]?.url || data?.url || null;

    if (!editedUrl) {
      return res.status(500).json({
        success: false,
        error: "No edited image URL returned"
      });
    }

    await saveMessageToCosmos(chatId, userId, "assistant", "Image edited", "image", editedUrl);

    return res.json({
      success: true,
      mediaUrl: editedUrl
    });
  } catch (error) {
    console.error("edit-image route error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error while editing image"
    });
  }
});
app.get("/api/history/threads", async (req, res) => {
  try {
    const { userId } = req.query;
    const threads = await getSidebarThreads(userId);
    res.json({ threads });
  } catch (error) {
    console.error("threads error:", error);
    res.status(500).json({ threads: [] });
  }
});

app.post("/api/chat/history", async (req, res) => {
  try {
    const { chatId, userId } = req.body;
    const messages = await getMessagesFromCosmos(chatId, userId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error("history error:", error);
    res.status(500).json({ success: false, error: "Failed to load history" });
  }
});

app.delete("/api/chat/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.query;
    await deleteChatThread(chatId, userId);
    res.json({ success: true });
  } catch (error) {
    console.error("delete error:", error);
    res.status(500).json({ success: false, error: "Delete failed" });
  }
});

// Note: /api/edit-image uses sora-2 which is a VIDEO model, not image editing
// To edit images, use your image deployment (e.g., gpt-image-1.5 or dall-e-3)

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running");
});