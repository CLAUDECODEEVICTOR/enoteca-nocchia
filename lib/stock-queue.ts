"use client";

// Shots waiting to reach the server, kept in IndexedDB: a dropped shop wifi or a
// closed tab must not lose a bottle. A shot leaves the queue only once saved.
export interface QueuedShot {
  id: string;
  imageBase64: string;
  photoBase64: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nocchia-stock", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("shots", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("shots", mode);
    const req = fn(tx.objectStore("shots"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const addShot = (s: QueuedShot) => run("readwrite", (o) => o.put(s));
export const removeShot = (id: string) => run("readwrite", (o) => o.delete(id));
export const allShots = () => run<QueuedShot[]>("readonly", (o) => o.getAll());
