
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
  contentType = "text",
  mediaUrl = null
) {
  const container = await initCosmos();

  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const messageItem = {
    id,
    chatId,
    userId,
    sender,
    type: "message",
    contentType,
    message: contentType === "text" ? messageText : null,
    text: contentType === "text" ? messageText : null,
    mediaUrl: mediaUrl || null,
    timestamp: new Date().toISOString()
  };

  await container.items.create(messageItem);

  if (sender === "user") {
    const { resources } = await container.items
      .query({
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
      })
      .fetchAll();

    if (resources.length === 0) {
      const title = await generateChatTitle(
        contentType === "text" ? messageText : `${contentType} generation request`
      );

      await container.items.create({
        id: chatId,
        chatId,
        userId,
        type: "thread",
        isDeleted: false,
        title,
        timestamp: new Date().toISOString()
      });

      log.thread(`Created thread: ${title}`);
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
      `,
      parameters: [{ name: "@userId", value: userId }]
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

  log.delete(`Deleting chatId=${chatId} userId=${userId}`);

  const { resources } = await container.items
    .query({
      query: `
        SELECT * FROM c
        WHERE c.chatId = @chatId
        AND c.userId = @userId
      `,
      parameters: [
        { name: "@chatId", value: chatId },
        { name: "@userId", value: userId }
      ]
    })
    .fetchAll();

  for (const item of resources) {
    try {
      await container.item(item.id, item.chatId).delete();
    } catch (err) {
      if (err.code !== 404) {
        log.error(`Delete failed for ${item.id}: ${err.message}`);
      }
    }
  }

  return true;
}

module.exports = {
  saveMessageToCosmos,
  getMessagesFromCosmos,
  getSidebarThreads,
  deleteChatThread
};