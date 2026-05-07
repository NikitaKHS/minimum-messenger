# End-to-End Encryption

## What the server never sees

- Message plaintext
- Private keys
- Decrypted file content
- Raw session tokens

## Current crypto primitives

| Primitive | Algorithm |
|---|---|
| Key exchange | ECDH P-256 |
| Key derivation | HKDF-SHA-256 |
| Message encryption | AES-GCM-256 |
| Key storage | IndexedDB (browser) / Keychain-Keystore (mobile), never synced |
| Fingerprints | SHA-256 of SPKI-encoded public key |

On the **web** client all crypto runs via the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). On the **mobile** client (React Native / Expo) the same primitives are implemented with `@noble/curves` and `@noble/hashes` — byte-compatible with the web implementation. Private keys on mobile are stored in `expo-secure-store`, which maps to the iOS Keychain and Android Keystore.

---

## Direct message flow

```
Alice (device A1)                           Bob (device B1)

generateKeyPair()  →  [pubA1 stored on server]
                       [pubB1 stored on server]

fetchKeyBundle(bob)  ←  { pubB1, fingerprintB1 }
deriveSharedKey(privA1, pubB1)  →  sharedKey
encrypt(sharedKey, "hello")  →  { ciphertext, iv }

POST /messages  →  { encrypted_payload: "{ciphertext,iv,v1}" }

                       ←  WS: message.new { encrypted_payload }
                       sharedKey = deriveSharedKey(privB1, pubA1)
                       decrypt(sharedKey, encrypted_payload)  →  "hello"
```

The shared key is derived fresh from key material each session. The server routes the `encrypted_payload` without ever being able to read it.

---

## Group message flow

Groups use a symmetric group key that is encrypted individually for each recipient device.

```
Alice creates group with Bob and Charlie

1. Alice generates groupKey (AES-256)
2. For each active device of each member:
     encryptedKey = ECDH_encrypt(groupKey, device.publicKey)
3. POST /chats/group with member list
4. Backend stores (chat_id, device_id, encrypted_group_key, key_version=1)

Sending a message:
1. Alice encrypts message with groupKey
2. POST /messages with:
     encrypted_payload: AES-GCM(groupKey, plaintext)
     group_keys: [{ device_id, encrypted_group_key, key_version }]

Receiving:
1. Bob fetches encrypted_group_key for his device
2. Decrypts it with his private key → groupKey
3. Decrypts encrypted_payload with groupKey
```

---

## Key rotation

Group key rotation happens when:
- A member is added (forward secrecy for new member — they don't get old keys by default)
- A member is removed (the removed member can't decrypt future messages)
- A device is revoked

On rotation, a new `ChatKeyVersion` record is created. The new group key is encrypted for all **remaining** active devices. Messages after the rotation use the new key version.

---

## Threat model

| Threat | Mitigation |
|---|---|
| Server-side breach | Attacker gets only ciphertext + metadata |
| Database dump | No plaintext anywhere in the schema |
| Compromised server process | Can't read messages in transit (TLS) or at rest (encrypted) |
| Weak passwords | Argon2id with high memory cost |
| Token theft | Short-lived access tokens (15 min), refresh tokens stored as hashes only |
| Session fixation | Refresh token rotated on every use |
| Revoked device | Group key rotated, new messages encrypted without the revoked device |
| Key substitution attack | Fingerprint UI warns on key change (to be implemented in UI) |

### Out of scope (current MVP)

- Forward secrecy within a session (requires double ratchet / Signal protocol)
- Sealed sender
- Metadata minimization (server still sees who talks to whom)

The architecture is designed to support a Signal-like double ratchet in a future version without breaking the existing API contract.

---

## Key storage (client)

Private keys are stored in IndexedDB under the key `minimum-keys` with key path `fingerprint`. They are non-exportable from the `crypto.subtle` perspective (generated with `extractable: true` currently, will be changed to `false` in production hardening sprint — extraction is only needed for backup flows).

On logout, keys remain in IndexedDB — they belong to the device, not the session. On device revocation, the user should manually clear IndexedDB or use the "remove device data" flow (to be implemented).
