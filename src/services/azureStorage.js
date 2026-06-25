import { TableClient } from "@azure/data-tables";

// Helper to get the table client securely
const getTableClient = () => {
  const sasUrl = import.meta.env.VITE_AZURE_STORAGE_SAS_URL;
  if (!sasUrl) {
    console.warn("Azure Storage SAS URL not provided. Running in local-only mode.");
    return null;
  }
  try {
    // If the SAS URL is a service-level URL, we must provide the table name explicitly.
    // "Chats" is our standard table name for this application.
    return new TableClient(sasUrl, "Chats");
  } catch (e) {
    console.error("Invalid SAS URL", e);
    return null;
  }
};

export const saveChatToAzure = async (chatId, title, messages, userId) => {
  if (!userId) return; // Do not save if unauthenticated
  
  const lastUpdated = new Date().toISOString();
  const chatData = { id: chatId, title, messages, lastUpdated };

  // Always save to localStorage first for instant local recovery
  try {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    localChats[chatId] = chatData;
    localStorage.setItem(`local_chats_${userId}`, JSON.stringify(localChats));
  } catch (e) {
    console.error("LocalStorage error", e);
  }

  const client = getTableClient();
  if (!client) return;

  try {
    // Ensure table exists before saving
    try {
      await client.createTable();
    } catch (e) {
      // 409 (Conflict) is returned if the table already exists. We can safely ignore it.
      if (e.statusCode !== 409 && e.code !== "TableAlreadyExists") {
        throw e;
      }
    }

    await client.upsertEntity({
      partitionKey: userId,
      rowKey: chatId,
      title: title,
      messages: JSON.stringify(messages),
      lastUpdated: lastUpdated
    }, "Replace");
  } catch (error) {
    console.error("Error saving chat to Azure:", error);
  }
};

export const loadChatsFromAzure = async (userId) => {
  if (!userId) return []; // Return empty if unauthenticated

  // 1. Instant recovery from LocalStorage
  let localChatsArray = [];
  try {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    localChatsArray = Object.values(localChats).sort((a, b) => 
      new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0)
    );
  } catch (e) {
    console.error("LocalStorage load error", e);
  }

  // 2. Fetch from Azure in background
  const client = getTableClient();
  if (!client) return localChatsArray;

  try {
    const chats = [];
    // Ensure the client is actually operational
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` }
    });
    
    for await (const entity of entities) {
      chats.push({
        id: entity.rowKey,
        title: entity.title,
        messages: JSON.parse(entity.messages || '[]'),
        lastUpdated: entity.lastUpdated || new Date(0).toISOString()
      });
    }
    
    const sortedAzureChats = chats.sort((a, b) => 
      new Date(b.lastUpdated) - new Date(a.lastUpdated)
    );

    // Merge or return Azure chats as the truth
    return sortedAzureChats.length > 0 ? sortedAzureChats : localChatsArray;
  } catch (error) {
    console.error("Azure Fetch Error (falling back to LocalStorage):", error);
    return localChatsArray;
  }
};

export const deleteChatFromAzure = async (chatId, userId) => {
  if (!userId) return;

  // 1. Delete from LocalStorage
  try {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    delete localChats[chatId];
    localStorage.setItem(`local_chats_${userId}`, JSON.stringify(localChats));
  } catch (e) {
    console.error("LocalStorage delete error", e);
  }

  // 2. Delete from Azure
  const client = getTableClient();
  if (!client) return;

  try {
    await client.deleteEntity(userId, chatId);
  } catch (error) {
    console.error("Error deleting chat from Azure:", error);
  }
};
