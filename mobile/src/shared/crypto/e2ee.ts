import { p256 } from '@noble/curves/p256';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { gcm } from '@noble/ciphers/aes';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_STORE = 'minimum_identity_priv_v1';
const E2E_PREFIX = 'e2e1';

const SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function pubKeyToSpkiB64(uncompressed: Uint8Array): string {
  const spki = new Uint8Array(SPKI_PREFIX.length + uncompressed.length);
  spki.set(SPKI_PREFIX);
  spki.set(uncompressed, SPKI_PREFIX.length);
  return bytesToB64(spki);
}

export function spkiB64ToPubKey(b64: string): Uint8Array {
  return b64ToBytes(b64).slice(SPKI_PREFIX.length);
}

export interface IdentityKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeySpki: string;
  fingerprint: string;
}

export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const privateKey = p256.utils.randomPrivateKey();
  const publicKey = p256.getPublicKey(privateKey, false);
  const publicKeySpki = pubKeyToSpkiB64(publicKey);
  const spkiBytes = b64ToBytes(publicKeySpki);
  const hash = sha256(spkiBytes);
  const fingerprint = Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { privateKey, publicKey, publicKeySpki, fingerprint };
}

export async function storeIdentityKey(privateKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(PRIVATE_KEY_STORE, bytesToB64(privateKey));
}

export async function loadIdentityKey(): Promise<Uint8Array | null> {
  const b64 = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  return b64 ? b64ToBytes(b64) : null;
}

export async function deleteIdentityKey(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
}

export function deriveSharedAesKey(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  const sharedPoint = p256.getSharedSecret(myPrivateKey, theirPublicKey, false);
  const sharedX = sharedPoint.slice(1, 33);
  return hkdf(sha256, sharedX, new Uint8Array(32), new TextEncoder().encode('minimum-v1'), 32);
}

export function encryptWithKey(plaintext: string, sharedKey: Uint8Array): string {
  const nonce = randomBytes(12);
  const ct = gcm(sharedKey, nonce).encrypt(new TextEncoder().encode(plaintext));
  return `${E2E_PREFIX}:${bytesToB64(nonce)}:${bytesToB64(ct)}`;
}

export function decryptWithKey(payload: string, sharedKey: Uint8Array): string {
  if (!payload.startsWith(`${E2E_PREFIX}:`)) return payload;
  const parts = payload.split(':');
  if (parts.length !== 3) return payload;
  try {
    const plain = gcm(sharedKey, b64ToBytes(parts[1])).decrypt(b64ToBytes(parts[2]));
    return new TextDecoder().decode(plain);
  } catch {
    return '[ошибка расшифровки]';
  }
}

export function isEncrypted(payload: string): boolean {
  return payload.startsWith(`${E2E_PREFIX}:`);
}

export function computeFingerprint(spkiB64: string): string {
  const bytes = b64ToBytes(spkiB64);
  const hash = sha256(bytes);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
