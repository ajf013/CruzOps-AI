const DB_NAME = 'cruzops_db';
const DB_VERSION = 1;
const CHAT_STORE = 'chats';
const QUEUE_STORE = 'sync_queue';

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event);
      reject(event);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
};

export const saveChatLocally = async (chat) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHAT_STORE, 'readwrite');
      const store = tx.objectStore(CHAT_STORE);
      const request = store.put(chat);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.error("saveChatLocally error", e);
    return false;
  }
};

export const getChatsLocally = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHAT_STORE, 'readonly');
      const store = tx.objectStore(CHAT_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.error("getChatsLocally error", e);
    return [];
  }
};

export const deleteChatLocally = async (chatId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHAT_STORE, 'readwrite');
      const store = tx.objectStore(CHAT_STORE);
      const request = store.delete(chatId);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.error("deleteChatLocally error", e);
    return false;
  }
};

export const queueOfflineAction = async (action) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const request = store.put(action);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.error("queueOfflineAction error", e);
    return false;
  }
};

export const getOfflineQueue = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.error("getOfflineQueue error", e);
    return [];
  }
};

export const clearOfflineQueue = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e);
    });
  } catch (e) {
    console.error("clearOfflineQueue error", e);
    return false;
  }
};
