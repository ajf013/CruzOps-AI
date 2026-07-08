import { TableClient } from "@azure/data-tables";
import { 
  saveChatLocally, 
  getChatsLocally, 
  deleteChatLocally, 
  queueOfflineAction, 
  getOfflineQueue, 
  clearOfflineQueue 
} from "./indexedDB";

// Helper to get the table client securely
const getTableClient = () => {
  const sasUrl = import.meta.env.VITE_AZURE_STORAGE_SAS_URL;
  if (!sasUrl) {
    console.warn("Azure Storage SAS URL not provided. Running in local-only mode.");
    return null;
  }
  try {
    return new TableClient(sasUrl, "Chats");
  } catch (e) {
    console.error("Invalid SAS URL", e);
    return null;
  }
};

let isTableCreated = false;

// Ensure table exists (internal helper)
const ensureTable = async (client) => {
  if (isTableCreated) return;
  try {
    await client.createTable();
    isTableCreated = true;
  } catch (e) {
    if (e.statusCode === 409 || e.code === "TableAlreadyExists") {
      isTableCreated = true;
    } else {
      throw e;
    }
  }
};

export const saveChatToAzure = async (chatId, title, messages, userId) => {
  if (!userId) return;
  
  const lastUpdated = new Date().toISOString();
  const chatData = { id: chatId, title, messages, lastUpdated, userId };

  // 1. Instant save to local IndexedDB
  await saveChatLocally(chatData);

  // 2. Also keep localStorage as a fallback
  try {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    localChats[chatId] = chatData;
    localStorage.setItem(`local_chats_${userId}`, JSON.stringify(localChats));
  } catch (e) {
    console.error("LocalStorage error", e);
  }

  // 3. Azure Cloud sync
  const client = getTableClient();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!client || !isOnline) {
    console.log("Offline or no Azure client. Queued save action.");
    await queueOfflineAction({ type: 'save', chatId, title, messages, userId, lastUpdated });
    return;
  }

  try {
    await ensureTable(client);
    await client.upsertEntity({
      partitionKey: userId,
      rowKey: chatId,
      title: title,
      messages: JSON.stringify(messages),
      lastUpdated: lastUpdated
    }, "Replace");
  } catch (error) {
    console.error("Error saving chat to Azure, queueing sync action:", error);
    await queueOfflineAction({ type: 'save', chatId, title, messages, userId, lastUpdated });
  }
};

export const loadChatsFromAzure = async (userId) => {
  if (!userId) return [];

  // 1. Fetch from local IndexedDB first (Instant recovery)
  const localDbChats = await getChatsLocally();
  const userLocalChats = localDbChats
    .filter(c => c.userId === userId)
    .sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));

  // 2. Fetch from Azure
  const client = getTableClient();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!client || !isOnline) {
    return userLocalChats;
  }

  try {
    await ensureTable(client);
    const chats = [];
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` }
    });
    
    for await (const entity of entities) {
      const chatObj = {
        id: entity.rowKey,
        title: entity.title,
        messages: JSON.parse(entity.messages || '[]'),
        lastUpdated: entity.lastUpdated || new Date(0).toISOString(),
        userId: userId
      };
      chats.push(chatObj);
      // Sync loaded Azure chat back to local IndexedDB to keep in sync
      await saveChatLocally(chatObj);
    }
    
    return chats.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  } catch (error) {
    console.error("Azure Fetch Error (falling back to IndexedDB):", error);
    return userLocalChats;
  }
};

export const deleteChatFromAzure = async (chatId, userId) => {
  if (!userId) return;

  // 1. Delete locally from IndexedDB
  await deleteChatLocally(chatId);

  // 2. Delete from LocalStorage
  try {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    delete localChats[chatId];
    localStorage.setItem(`local_chats_${userId}`, JSON.stringify(localChats));
  } catch (e) {
    console.error("LocalStorage delete error", e);
  }

  // 3. Delete from Azure
  const client = getTableClient();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!client || !isOnline) {
    console.log("Offline or no Azure client. Queued delete action.");
    await queueOfflineAction({ type: 'delete', chatId, userId });
    return;
  }

  try {
    await client.deleteEntity(userId, chatId);
  } catch (error) {
    console.error("Error deleting chat from Azure, queueing delete action:", error);
    await queueOfflineAction({ type: 'delete', chatId, userId });
  }
};

export const syncOfflineQueue = async (userId) => {
  if (!userId) return;

  const client = getTableClient();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!client || !isOnline) {
    return;
  }

  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) return;

    console.log(`Syncing ${queue.length} offline actions to Azure...`);
    await ensureTable(client);

    for (const action of queue) {
      if (action.userId !== userId) continue;

      if (action.type === 'save') {
        await client.upsertEntity({
          partitionKey: action.userId,
          rowKey: action.chatId,
          title: action.title,
          messages: JSON.stringify(action.messages),
          lastUpdated: action.lastUpdated
        }, "Replace");
      } else if (action.type === 'delete') {
        try {
          await client.deleteEntity(action.userId, action.chatId);
        } catch (e) {
          // If already deleted in cloud, ignore error
          if (e.statusCode !== 404) throw e;
        }
      }
    }

    await clearOfflineQueue();
    console.log("Offline queue synced and cleared successfully.");
  } catch (error) {
    console.error("Error syncing offline queue to Azure:", error);
  }
};
