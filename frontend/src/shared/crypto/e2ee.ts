const ALGO = { name: "AES-GCM", length: 256 };
const KEY_PAIR_ALGO = { name: "ECDH", namedCurve: "P-256" };
const E2E_PREFIX = "e2e1";

// ─── Key generation ───────────────────────────────────────────────────────────

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(KEY_PAIR_ALGO, true, ["deriveKey", "deriveBits"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("spki", raw, KEY_PAIR_ALGO, true, []);
}

export async function computeFingerprint(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("spki", publicKey);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── ECDH shared key derivation ───────────────────────────────────────────────

export async function deriveSharedKey(
  privateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    privateKey,
    256,
  );
  const keyMaterial = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("minimum-v1"),
    },
    keyMaterial,
    ALGO,
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── e2e1: payload format (compatible with mobile) ───────────────────────────

export function isEncryptedPayload(payload: string): boolean {
  return payload.startsWith(`${E2E_PREFIX}:`);
}

export async function encryptPayload(key: CryptoKey, plaintext: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );
  const b64 = (arr: Uint8Array) => btoa(String.fromCharCode(...arr));
  return `${E2E_PREFIX}:${b64(nonce)}:${b64(new Uint8Array(ct))}`;
}

export async function decryptPayload(key: CryptoKey, payload: string): Promise<string> {
  if (!isEncryptedPayload(payload)) return payload;
  const parts = payload.split(":");
  if (parts.length !== 3) return payload;
  const b2u = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b2u(parts[1]) },
      key,
      b2u(parts[2]),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "[ошибка расшифровки]";
  }
}

// ─── IndexedDB key store ──────────────────────────────────────────────────────

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("minimum-keys", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys", { keyPath: "fingerprint" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeKeyPair(keyPair: CryptoKeyPair, fingerprint: string): Promise<void> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put({ fingerprint, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadMyKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const req = tx.objectStore("keys").getAll();
    req.onsuccess = () => {
      const records = req.result as Array<{ fingerprint: string; privateKey: CryptoKey; publicKey: CryptoKey }>;
      resolve(records.length > 0 ? { privateKey: records[0].privateKey, publicKey: records[0].publicKey } : null);
    };
    req.onerror = () => reject(req.error);
  });
}
