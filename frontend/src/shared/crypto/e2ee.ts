/**
 * E2EE cryptographic primitives using the Web Crypto API.
 *
 * Identity keys: X25519 ECDH (P-256 as Web Crypto fallback)
 * Message encryption: AES-GCM-256
 * Key derivation: HKDF-SHA-256
 *
 * In the MVP the client:
 * 1. Generates an identity key pair at registration.
 * 2. Stores the private key in IndexedDB (never sent to backend).
 * 3. Sends only the public key to the backend.
 * 4. For direct messages: derives a shared secret via ECDH + HKDF.
 * 5. For group messages: encrypts the group key for each recipient device.
 */

const ALGO = { name: "AES-GCM", length: 256 };
const KEY_PAIR_ALGO = { name: "ECDH", namedCurve: "P-256" };
const HKDF_ALGO = { name: "HKDF", hash: "SHA-256" };

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

// ─── ECDH key agreement ───────────────────────────────────────────────────────

export async function deriveSharedKey(
  privateKey: CryptoKey,
  theirPublicKey: CryptoKey
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    privateKey,
    256
  );
  const keyMaterial = await crypto.subtle.importKey("raw", bits, HKDF_ALGO.name, false, [
    "deriveKey",
  ]);
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
    ["encrypt", "decrypt"]
  );
}

// ─── AES-GCM encrypt / decrypt ───────────────────────────────────────────────

export async function generateMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(ALGO, true, ["encrypt", "decrypt"]);
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decrypt(
  key: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<string> {
  const ct = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, ct);
  return new TextDecoder().decode(decrypted);
}

// ─── Group key encryption (wrapping) ──────────────────────────────────────────

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importAesKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, ALGO, true, ["encrypt", "decrypt"]);
}

/**
 * Encrypts the group key for a recipient's device using ECDH-derived shared key.
 */
export async function encryptGroupKeyForDevice(
  groupKey: CryptoKey,
  myPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, recipientPublicKey);
  const rawGroupKey = await exportKey(groupKey);
  const { ciphertext, iv } = await encrypt(sharedKey, rawGroupKey);
  return JSON.stringify({ ciphertext, iv });
}

export async function decryptGroupKey(
  encryptedGroupKey: string,
  myPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<CryptoKey> {
  const sharedKey = await deriveSharedKey(myPrivateKey, senderPublicKey);
  const { ciphertext, iv } = JSON.parse(encryptedGroupKey) as { ciphertext: string; iv: string };
  const rawGroupKeyB64 = await decrypt(sharedKey, ciphertext, iv);
  return importAesKey(rawGroupKeyB64);
}

// ─── Encrypted payload format ─────────────────────────────────────────────────

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  version: "v1";
}

export async function encryptMessage(
  key: CryptoKey,
  text: string
): Promise<string> {
  const { ciphertext, iv } = await encrypt(key, text);
  const payload: EncryptedMessage = { ciphertext, iv, version: "v1" };
  return JSON.stringify(payload);
}

export async function decryptMessage(key: CryptoKey, payloadJson: string): Promise<string> {
  const { ciphertext, iv } = JSON.parse(payloadJson) as EncryptedMessage;
  return decrypt(key, ciphertext, iv);
}
