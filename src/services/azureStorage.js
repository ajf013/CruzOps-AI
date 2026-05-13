import { TableClient } from "@azure/data-tables";

// Helper to get the table client securely
const getTableClient = () => {
  const sasUrl = import.meta.env.VITE_AZURE_STORAGE_SAS_URL;
  if (!sasUrl) {
    console.warn("Azure Storage SAS URL not provided. Running in local-only mode.");
    return null;
  }
  try {
    return new TableClient(sasUrl);
  } catch (e) {
    console.error("Invalid SAS URL", e);
    return null;
  }
};

export const saveChatToAzure = async (chatId, title, messages, userId) => {
  if (!userId) return; // Do not save if unauthenticated
  
  const client = getTableClient();
  if (!client) {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    localChats[chatId] = { id: chatId, title, messages };
    localStorage.setItem(`local_chats_${userId}`, JSON.stringify(localChats));
    return;
  }

  try {
    await client.upsertEntity({
      partitionKey: userId,
      rowKey: chatId,
      title: title,
      messages: JSON.stringify(messages)
    }, "Replace");
  } catch (error) {
    console.error("Error saving chat to Azure:", error);
  }
};

export const loadChatsFromAzure = async (userId) => {
  if (!userId) return []; // Return empty if unauthenticated

  const client = getTableClient();
  if (!client) {
    const localChats = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
    return Object.values(localChats).sort((a, b) => b.id.localeCompare(a.id));
  }

  try {
    const chats = [];
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${userId}'` }
    });
    
    for await (const entity of entities) {
      chats.push({
        id: entity.rowKey,
        title: entity.title,
        messages: JSON.parse(entity.messages || '[]')
      });
    }
    return chats.sort((a, b) => b.id.localeCompare(a.id));
  } catch (error) {
    console.error("Error loading chats from Azure:", error);
    return [];
  }
};
