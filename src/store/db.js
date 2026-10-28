// The family archive, kept in this browser's IndexedDB and nowhere else. No account, no
// server, no cloud copy. "sessions" holds each session's record; "blobs" holds the audio.
// Exporting the archive (archive.js) is how a family keeps a copy or moves it to a laptop.

const DB_NAME = "tell-me-again";
const VERSION = 1;

let dbP = null;

function open() {
  dbP ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other tabs of this app, then reload."));
  });
  return dbP;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => (out = r.result);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("The save was stopped."));
  });
}

export const newId = (prefix = "s") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function newSession({ elder = {}, lang = "en" } = {}) {
  const now = new Date().toISOString();
  return { id: newId("s"), createdAt: now, updatedAt: now, elder: { name: elder.name || "", relation: elder.relation || "" }, lang, consent: null, stories: [], book: null };
}

export async function saveSession(session) {
  session.updatedAt = new Date().toISOString();
  await tx("sessions", "readwrite", (s) => s.put(structuredClone(session)));
  return session;
}

export const getSession = (id) => tx("sessions", "readonly", (s) => s.get(id));

export async function listSessions() {
  const all = (await tx("sessions", "readonly", (s) => s.getAll())) || [];
  return all.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export const putBlob = (id, blob) => tx("blobs", "readwrite", (s) => s.put(blob, id));
export const getBlob = (id) => tx("blobs", "readonly", (s) => s.get(id));
export const deleteBlob = (id) => tx("blobs", "readwrite", (s) => s.delete(id));

/** Delete a session and all of its audio. */
export async function deleteSession(id) {
  const s = await getSession(id);
  if (!s) return;
  const blobs = [s.consent?.blobId, ...s.stories.map((x) => x.blobId)].filter(Boolean);
  for (const b of blobs) await deleteBlob(b);
  await tx("sessions", "readwrite", (st) => st.delete(id));
}
