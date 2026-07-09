const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { saveMessageToCosmos, getMessagesFromCosmos, getSidebarThreads, deleteChatThread } = require("./cosmosClient");
const { generateChatTitle, generateImage, generateVideo, getAIResponse } = require("./openai");
const { sendEmail, deleteEmail, getEmails } = require("./emailService");
const app = express();
app.use(cors());
app.use(express.json());
function parseEmailIntent(message) {
  const text = message.trim();

  // Pattern for: send email to ... subject ... body ...
  const sendPattern = /^send email to\s+(.+?)\s+subject\s+(.+?)\s+body\s+([\s\S]+)$/i;
  const sendMatch = text.match(sendPattern);

  if (sendMatch) {
    return {
      type: "send",
      to: sendMatch[1].trim(),
      subject: sendMatch[2].trim(),
      body: sendMatch[3].trim(),
    };
  }

  // Pattern for: delete email from ... subject ...
const deletePattern = /^delete email from\s+(\S+)\s+subject\s+([\s\S]+)$/i;
  const deleteMatch = text.match(deletePattern);

  if (deleteMatch) {
    return {
      type: "delete",
      from: deleteMatch[1].trim(),
      subject: deleteMatch[2].trim(),
    };
  }

  return null;
}
app.post("/api/chat", async (req, res) => {
  const { message, chatId, userId, token } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: "Message is required" });
  }

  try {
    const emailIntent = parseEmailIntent(message);

    if (emailIntent) {
      if (emailIntent.type === "send") {
        if (!token) {
          return res.status(401).json({
            success: false,
            error: "Access token is required to send email",
          });
        }

        const result = await sendEmail(
          token,
          emailIntent.to,
          emailIntent.subject,
          emailIntent.body
        );

        if (chatId && userId) {
          await saveMessageToCosmos(chatId, userId, "user", message, "text", null);
          await saveMessageToCosmos(chatId, userId, "assistant", result, "text", null);
        }

        return res.json({
          success: true,
          type: "email",
          answer: result,
        });
      }

      if (emailIntent.type === "delete") {
        if (!token) {
          return res.status(401).json({
            success: false,
            error: "Access token is required to delete email",
          });
        }

        console.log("🔍 Deleting email...");
        console.log("📝 Looking for: from=", emailIntent.from, "subject=", emailIntent.subject);

        // First, get emails to find the one matching from + subject
        const emails = await getEmails(token);

        console.log("📧 Found", emails.length, "emails"); // ✅ Added this

        // Find email matching the sender and subject
        const targetEmail = emails.find(email => {
          const fromAddress = email.from?.emailAddress?.address || "";
          const toAddresses = email.toRecipients?.map(r => r.emailAddress?.address) || []; // ✅ Added this
          const subject = email.subject || "";

          console.log("🔎 Checking:", { from: fromAddress, to: toAddresses, subject: subject });

          // Check if sender matches OR any recipient matches + subject matches
          const fromMatches = fromAddress.toLowerCase().includes(emailIntent.from.toLowerCase());
          const toMatches = toAddresses.some(to => to.toLowerCase().includes(emailIntent.from.toLowerCase()));
          const subjectMatches = subject.toLowerCase().includes(emailIntent.subject.toLowerCase());

          return (fromMatches || toMatches) && subjectMatches;
        });

        if (!targetEmail) {
          console.log("❌ No matching email found");
          console.log("📧 Available emails:", emails.map(e => ({ from: e.from?.emailAddress?.address, to: e.toRecipients?.map(r => r.emailAddress?.address), subject: e.subject })));

          return res.json({
            success: false,
            type: "email",
            answer: "No email found matching that sender and subject 📭",
          });
        }

        console.log("✅ Found email:", { id: targetEmail.id, subject: targetEmail.subject, from: targetEmail.from?.emailAddress?.address });

        // Delete the email
        try {
          const result = await deleteEmail(token, targetEmail.id);

          if (chatId && userId) {
            await saveMessageToCosmos(chatId, userId, "user", message, "text", null);
            await saveMessageToCosmos(chatId, userId, "assistant", result, "text", null);
          }

          console.log("✅ Delete successful:", result);

          return res.json({
            success: true,
            type: "email",
            answer: result,
          });
        } catch (deleteError) {
          console.error("❌ Delete failed:", deleteError);
          return res.json({
            success: false,
            type: "email",
            answer: deleteError.message,
          });
        }
      }
    }
    // ✅ Image Detection
    if (message.startsWith('/image ')) {
      console.log("🎨 Image request detected:", message);
      const prompt = message.replace('/image ', '').trim();
      const result = await generateImage(prompt);
      
      // ✅ Save to COSMOS
      if (result.success && chatId && userId) {
        await saveMessageToCosmos(chatId, userId, "user", prompt, "image", null);
        await saveMessageToCosmos(chatId, userId, "assistant", "Image generated", "image", result.mediaUrl);
      }
      
      // ✅ ADD "type" FIELD FOR IMAGE
      return res.json({
        success: result.success,
        mediaUrl: result.mediaUrl,
        type: "image",
        error: result.error
      });
    }

    // ✅ Video Detection
    if (message.startsWith('/video ')) {
      console.log("🎬 Video request detected:", message);
      const prompt = message.replace('/video ', '').trim();
      const result = await generateVideo(prompt);
      
      // ✅ Save to COSMOS
      if (result.success && chatId && userId) {
        await saveMessageToCosmos(chatId, userId, "user", prompt, "video", null);
        await saveMessageToCosmos(chatId, userId, "assistant", "Video generated", "video", result.mediaUrl);
      }
      
      // ✅ ADD "type" FIELD FOR VIDEO
      return res.json({
        success: result.success,
        mediaUrl: result.mediaUrl,
        type: "video",
        error: result.error
      });
    }

    // ✅ Normal Chat
    let aiResponse;
    
    if (userId) {
      aiResponse = await getAIResponse(message, userId);
    } else {
      aiResponse = await getAIResponse(message);
    }

    // ✅ Save to COSMOS
    if (chatId && userId) {
      console.log("💾 SAVING USER MESSAGE:", message);
      await saveMessageToCosmos(chatId, userId, "user", message, "text", null);
      
      console.log("💾 SAVING BOT RESPONSE:", aiResponse.text);
      await saveMessageToCosmos(
        chatId,
        userId,
        "assistant",
        aiResponse.text,
        aiResponse.mediaUrl ? "image" : "text",
        aiResponse.mediaUrl
      );
    }

    res.json({
      success: true,
      answer: aiResponse.text,
      type: aiResponse.type,
      mediaUrl: aiResponse.mediaUrl
    });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
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

app.get("/api/download-image", async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: "URL required" });
    }
    
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="image.png"`);
    res.send(buffer);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Download failed" });
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running");
});