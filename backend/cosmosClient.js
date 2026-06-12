const { CosmosClient } = require("@azure/cosmos");
require("dotenv").config();
const { generateChatTitle } = require("./openai");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY
});

let containerInstance = null;

/* ================= INIT COSMOS ================= */
async function initCosmos() {
  if (containerInstance) return containerInstance;

  const dbName = process.env.COSMOS_DATABASE_NAME || "TASK-v2";
  const containerName =
    process.env.COSMOS_CONTAINER_NAME || "new-chat-container-v2";

  if (!process.env.COSMOS_ENDPOINT) {
    throw new Error("COSMOS_ENDPOINT missing in .env");
  }

  let db;

  try {
    db = client.database(dbName);
    await db.read();
  } catch (err) {
    if (err.code === 404) {
      const result = await client.databases.create({ id: dbName });
      db = result.database;
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
  } catch (err) {
    if (err.code === 409) {
      containerInstance = db.container(containerName);
      await containerInstance.read();
    } else {
      throw err;
    }
  }

  return containerInstance;
}

/* ================= SAVE MESSAGE (FIXED CORE BUG HERE) ================= */
async function saveMessageToCosmos(
  chatId,
  userId,
  sender,
  messageText,
  contentType = "text",
  imageUrl = null
) {
  const container = await initCosmos();

  const id = `msg_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 7)}`;

const messageItem = {
  id,
  chatId,
  userId,
  sender,
  type: "message",
  contentType, // text | image | video

  message: contentType === "text" ? messageText : null,

  // unified media field (IMPORTANT for frontend)
  mediaUrl:
    contentType === "image" || contentType === "video"
      ? imageUrl
      : null,

  timestamp: new Date().toISOString()
};

  await container.items.create(messageItem);

  /* ================= THREAD CREATION ================= */
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
      const title = await generateChatTitle(messageText);

      await container.items.create({
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

/* ================= GET MESSAGES ================= */
async function getMessagesFromCosmos(chatId, userId) {
  const container = await initCosmos();

  try {
    const { resources } = await container.items
      .query({
        query: `
          SELECT * FROM c
          WHERE c.chatId = "${chatId}"
          AND c.userId = "${userId}"
          AND c.type = "message"
        `
      })
      .fetchAll();

    return resources.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
  } catch (error) {
    console.error("getMessagesFromCosmos error:", error);
    return [];
  }
}

/* ================= THREADS ================= */
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

/* ================= DELETE THREAD ================= */
async function deleteChatThread(chatId, userId) {
  const container = await initCosmos();

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

  for (const msg of resources) {
    try {
      await container.item(msg.id, msg.chatId).delete();
    } catch (err) {
      console.error("Delete error:", err.message);
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