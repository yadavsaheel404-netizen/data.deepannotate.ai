import { useEffect, useState } from "react";

const DB_NAME = "dataforge-autosaves";
const STORE_NAME = "annotations";
const DB_VERSION = 1;

export function useIndexedDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);

  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event);
    };

    request.onsuccess = (event) => {
      setDb((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  }, []);

  const saveLocal = async (id: string, data: any): Promise<void> => {
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id, data, updatedAt: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = (err) => reject(err);
    });
  };

  const getLocal = async (id: string): Promise<any | null> => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result ? request.result.data : null);
      };
      request.onerror = (err) => reject(err);
    });
  };

  const removeLocal = async (id: string): Promise<void> => {
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (err) => reject(err);
    });
  };

  return { saveLocal, getLocal, removeLocal, isReady: !!db };
}
