const DB_NAME = "dictionary-cache";
const DB_VERSION = 2;
const ENTRIES_STORE = "entries";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains("turkish_words")) {
        database.deleteObjectStore("turkish_words");
      }
      if (!database.objectStoreNames.contains(ENTRIES_STORE)) {
        const store = database.createObjectStore(ENTRIES_STORE, { keyPath: "cacheKey" });
        store.createIndex("language", "language", { unique: false });
        store.createIndex("languageWord", ["language", "word"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizedWord(word) {
  return String(word || "").trim().toLocaleLowerCase("tr-TR");
}

export async function findCachedEntries(language, word) {
  const database = await openDatabase();
  const request = database.transaction(ENTRIES_STORE, "readonly")
    .objectStore(ENTRIES_STORE).index("languageWord")
    .getAll([language, normalizedWord(word)]);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => { database.close(); resolve(request.result || []); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export async function cacheEntries(language, entries) {
  if (!Array.isArray(entries) || !entries.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(ENTRIES_STORE, "readwrite");
  const store = transaction.objectStore(ENTRIES_STORE);
  entries.forEach((entry) => {
    const word = normalizedWord(entry?.word);
    if (!word) return;
    const etymology = Number(entry.etymology || 1);
    store.put({ ...entry, language, word, etymology, cacheKey: `${language}|${word}|${etymology}` });
  });
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export const findCachedBaseWords = (word) =>
  findCachedEntries("turkish", word);

export async function getCachedEntries(language) {
  const database = await openDatabase();
  const request = database.transaction(
    ENTRIES_STORE,
    "readonly"
  ).objectStore(ENTRIES_STORE)
    .index("language")
    .getAll(language);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      database.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function clearCachedEntries(language) {
  const database = await openDatabase();
  const readTransaction = database.transaction(
    ENTRIES_STORE,
    "readonly"
  );
  const request = readTransaction.objectStore(ENTRIES_STORE)
    .index("language").getAll(language);
  const entries = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction(
    ENTRIES_STORE,
    "readwrite"
  );
  const store = transaction.objectStore(ENTRIES_STORE);
  entries.forEach((entry) => store.delete(entry.cacheKey));

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}
