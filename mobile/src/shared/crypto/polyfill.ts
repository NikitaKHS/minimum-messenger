import { getRandomBytes } from 'expo-crypto';

if (typeof globalThis.crypto === 'undefined' || globalThis.crypto === null) {
  (globalThis as unknown as Record<string, unknown>).crypto = {};
}

if (typeof (globalThis.crypto as { getRandomValues?: unknown }).getRandomValues !== 'function') {
  (globalThis.crypto as unknown as Record<string, unknown>).getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const bytes = getRandomBytes(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  };
}
