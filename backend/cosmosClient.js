
const { CosmosClient } = require("@azure/cosmos");
require("dotenv").config();
const { generateChatTitle } = require("./openai");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
  connectionTimeout: 30000,
});

let containerInstance = null;

const log = {
  info: (msg) => console.log(`🟦 [INFO] ${msg}`),
  cosmos: (msg) => console.log(`🛢 [COSMOS] ${msg}`),
  thread: (msg) => console.log(`🧵 [THREAD] ${msg}`),
  delete: (msg) => console.log(`🗑 [DELETE] ${msg}`),
  error: (msg) => console.error(`❌ [ERROR] ${msg}`),
};

async function initCosmos() {
  if (containerInstance) return containerInstance;

  const dbName = process.env.COSMOS_DATABASE_NAME || "TASK-v2";
  const containerName = process.env.COSMOS_CONTAINER_NAME || "new-chat-container-v2";

  if (!process.env.COSMOS_ENDPOINT) {
    throw new Error("COSMOS_ENDPOINT missing in .env");
  }

  let db;
  try {
    db = client.database(dbName);
    await db.read();
    log.cosmos(`Database ready: ${dbName}`);
  } catch (err) {
    if (err.code === 404) {
      const result = await client.databases.create({ id: dbName });
      db = result.database;
      log.cosmos(`Database created: ${dbName}`);
    } else {
      throw err;
    }
  }

  try {
    const result = await db.containers.create({
      id: containerName,
      partitionKey: { paths: ["/chatId"] }
    });
    containerInstance = result.container;
    log.cosmos(`Container created: ${containerName}`);
  } catch (err) {
    if (err.code === 409) {
      containerInstance = db.container(containerName);
      await containerInstance.read();
      log.cosmos(`Container ready: ${containerName}`);
    } else {
      throw err;
    }
  }

  return containerInstance;
}
async function saveMessageToCosmos(
  chatId,
  userId,
  sender,
  messageText,
  contentType,
  mediaUrl
) {
  const container = await initCosmos();

  // ✅ USE UUID FOR UNIQUE ID (prevents 409 duplicate error)
  const { v4: uuidv4 } = require("uuid");
  const id = `msg_${uuidv4()}`;

 const messageItem = {
  id,
  chatId,
  userId,
  sender,
  type: "message",
  contentType,
  message: messageText,  // ✅ USE messageText
  text: messageText,     // ✅ USE messageText
  mediaUrl,
  timestamp: new Date().toISOString()
};
  console.log("🟦 SAVING MESSAGE:", {
    id: messageItem.id,
    chatId: messageItem.chatId,
    userId: messageItem.userId,
    sender: messageItem.sender
   
  });

  try {
    // ✅ USE UPSERT instead of create (replaces if ID exists)
    const result = await container.items.upsert(messageItem);
    console.log("✅ MESSAGE SAVED SUCCESSFULLY:", messageItem.id);
    if (sender === "user" || sender === "assistant") {
  await updateThreadTimestamp(chatId, userId);
}
  } catch (error) {
    console.error("❌ FAILED TO SAVE MESSAGE!");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    throw error;
  }

  // Create thread if first user message
if (sender === "user") {
  const { resources } = await container.items.query({
    query: `
      SELECT * FROM c
      WHERE c.chatId = @chatId
      AND c.userId = @userId
      AND c.type = "thread"
      AND (NOT IS_DEFINED(c.isDeleted) OR c.isDeleted = false)
    `,
    parameters: [
      { name: "@chatId", value: chatId },
      { name: "@userId", value: userId }
    ]
  }).fetchAll();

  if (resources.length === 0) {
    let titleText = messageText;

    if (contentType === "image") titleText = `Image: ${messageText}`;
    if (contentType === "video") titleText = `Video: ${messageText}`;

    const title = await generateChatTitle(titleText);

    await container.items.upsert({
      id: chatId,
      chatId,
      userId,
      type: "thread",
      isDeleted: false,
      title,
      timestamp: new Date().toISOString()
    });
  }
}
  return true;
}

async function getMessagesFromCosmos(chatId, userId) {
  const container = await initCosmos();

  try {
    const { resources } = await container.items
      .query({
        query: `
          SELECT * FROM c
          WHERE c.chatId = @chatId
          AND c.userId = @userId
          AND c.type = "message"
        `,
        parameters: [
          { name: "@chatId", value: chatId },
          { name: "@userId", value: userId }
        ]
      })
      .fetchAll();

    return resources.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (error) {
    log.error(`getMessagesFromCosmos failed: ${error.message}`);
    return [];
  }
}

async function getSidebarThreads(userId) {
  const container = await initCosmos();

  const { resources } = await container.items
    .query({
  query: `
    SELECT * FROM c
    WHERE c.userId = @userId
    AND c.type = "thread"
    AND (NOT IS_DEFINED(c.isDeleted) OR c.isDeleted = false)
    ORDER BY c.timestamp DESC
  `,
  parameters: [{ name: "@userId", value: userId }],
  maxItemCount: -1  // ✅ ADD THIS LINE
})
    .fetchAll();

  const map = new Map();

  for (const item of resources) {
    if (!map.has(item.chatId)) {
      map.set(item.chatId, {
        chatId: item.chatId,
        title: item.title || "New Chat",
        timestamp: item.timestamp
      });
    }
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

async function deleteChatThread(chatId, userId) {
  const container = await initCosmos();

  // Query all items
  const { resources } = await container.items.query({
    query: `SELECT c.id, c.chatId FROM c WHERE c.chatId = @chatId AND c.userId = @userId`,
    parameters: [
      { name: "@chatId", value: chatId },
      { name: "@userId", value: userId }
    ]
  }).fetchAll();

  console.log(`Found ${resources.length} items to delete`);

  // Delete each one
  for (const item of resources) {
    try {
      await container.item(item.id, item.chatId).delete();
      console.log(`✅ Deleted: ${item.id}`);
    } catch (error) {
      if (error.code !== 404) {
        console.error(`❌ Error deleting ${item.id}:`, error.message);
      }
    }
  }

  return true;
}
async function getAllUserChats(userId) {
  try {
    const container = await initCosmos();
    
    const query = `
      SELECT c.chatId, c.title, c.timestamp 
      FROM c 
      WHERE c.userId = "${userId}" 
      AND c.type = "thread"
      ORDER BY c.timestamp DESC
    `;
    
    const { resources } = await container.items.query({ query }).fetchAll();
    return resources;
  } catch (error) {
    console.error("Get all chats error:", error);
    return [];
  }
}
async function getRecentUserContext(userId, currentMessage) {
  try {
    console.log("🔍 SUPER MEMORY: Getting ALL user context for userId:", userId);
    
    // Get ALL chats for this user (no limit)
    const container = await initCosmos();
    const result = await container.items.query({
      query: `
        SELECT DISTINCT c.chatId, c.title, c.timestamp 
        FROM c 
        WHERE c.userId = "${userId}" AND c.type = "thread"
        ORDER BY c.timestamp DESC
      `
    }).fetchAll();
    
    const allChats = result.resources;
    
    if (allChats.length === 0) {
      console.log("📭 No previous chats found");
      return "";
    }
    
    console.log(`📚 Found ${allChats.length} total chats for user`);
    
    // Get ALL messages from ALL chats (last 10 most recent chats)
    let allMessages = [];
    
    for (const chat of allChats.slice(0, 10)) {  // Get last 10 chats
      const messagesResult = await container.items.query({
        query: `
          SELECT * FROM c 
          WHERE c.chatId = "${chat.chatId}" AND c.userId = "${userId}" AND c.type = "message"
          ORDER BY c.timestamp DESC
        `
      }).fetchAll();
      
      // Add chat title to each message
      messagesResult.resources.forEach(msg => {
        msg.chatTitle = chat.title;
        msg.chatId = chat.chatId;
      });
      
      allMessages = allMessages.concat(messagesResult.resources);
    }
    
    // Sort by timestamp (most recent first)
    allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Extract ONLY meaningful AI responses (filter out image/video gen messages)
    const meaningfulAIResponses = allMessages.filter(m => 
      m.sender === "assistant" && 
      m.message && 
      m.message.length > 50 &&  
      !m.message.includes("Image generated") &&
      !m.message.includes("Video generated") &&
      !m.message.includes("updating image") &&
      !m.message.includes("generating video")
    );
    
    console.log(`📝 Found ${meaningfulAIResponses.length} meaningful AI responses`);
    
    if (meaningfulAIResponses.length === 0) {
      return "";
    }
    
    // Get LAST 5 topics (most recent discussions) - INCREASED FROM 3
    const last5Topics = meaningfulAIResponses.slice(0, 5);
    
    // Build DETAILED context string
    let context = "🧠 SUPER MEMORY - ALL PREVIOUS TOPICS DISCUSSED:\n\n";
    context += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    
    for (let i = 0; i < last5Topics.length; i++) {
      const topic = last5Topics[i];
      
      // Get full message (not truncated)
      const fullText = topic.message;
      
      context += `${i + 1}. [${topic.chatTitle || "Chat"}] - ${topic.chatId}\n`;
      context += `   📅 ${new Date(topic.timestamp).toLocaleString()}\n`;
      context += `   💬 ${fullText.substring(0, 300)}\n`;  // First 300 chars
      context += `   🔗 FULL: ${fullText}\n\n`;
      
      if (i < last5Topics.length - 1) {
        context += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
      }
    }
    
    context += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    context += "\n🎯 IMPORTANT MEMORY RULES:\n";
    context += "1. If user says 'more details' → Give MORE about the MOST RECENT topic (topic #1)\n";
    context += "2. If user says 'tell me more' → Expand on the LAST discussed topic\n";
    context += "3. If user says 'explain [topic]' → Explain that topic in detail (check if discussed)\n";
    context += "4. If user asks vague question → Reference related topics from memory\n";
    context += "5. If user says 'thank you'/'super'/'cute' → Short warm response (2-3 sentences)\n";
    context += "6. ALWAYS connect new questions to previous discussions when possible\n";
    context += "7. Remember: User might ask about ANY topic from ALL previous chats\n";
    context += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    
    console.log("✅ SUPER MEMORY context built successfully");
    console.log("📏 Context length:", context.length, "characters");
    
    return context;
  } catch (error) {
    console.error("❌ SUPER MEMORY Error:", error);
    return "⚠️ Memory system temporarily unavailable, but I'll still answer your question!";
  }
}
async function updateThreadTimestamp(chatId, userId) {
  const container = await initCosmos();

  const { resources } = await container.items.query({
    query: `
      SELECT * FROM c
      WHERE c.chatId = @chatId
      AND c.userId = @userId
      AND c.type = "thread"
      AND (NOT IS_DEFINED(c.isDeleted) OR c.isDeleted = false)
    `,
    parameters: [
      { name: "@chatId", value: chatId },
      { name: "@userId", value: userId }
    ]
  }).fetchAll();

  if (resources.length === 0) return false;

  const thread = resources[0];
  thread.timestamp = new Date().toISOString();

  await container.items.upsert(thread);
  return true;
}
// ✅ UPDATE module.exports (this should be the LAST 10 lines):
module.exports = {
  saveMessageToCosmos,
  getMessagesFromCosmos,
  getSidebarThreads,
  deleteChatThread,
  getAllUserChats,        
  getRecentUserContext,
  updateThreadTimestamp     
};