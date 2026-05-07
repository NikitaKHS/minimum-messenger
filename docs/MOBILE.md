# Mobile Application

## Stack

| Layer | Technology |
|---|---|
| Framework | React Native via Expo SDK 52 |
| Navigation | React Navigation v7 (native stack + bottom tabs) |
| List rendering | `@shopify/flash-list` — virtualized, 60 fps |
| Animations | `react-native-reanimated` v3 |
| Gestures | `react-native-gesture-handler` v2 |
| HTTP client | axios (shared interceptor pattern with web) |
| WebSocket | Native WebSocket API |
| State | Zustand v5 (same stores as web) |
| Server state | TanStack Query v5 |
| Crypto | `@noble/curves`, `@noble/hashes` |
| Key storage | `expo-secure-store` → iOS Keychain / Android Keystore |
| Persistence | Zustand + `expo-secure-store` (tokens, keys) |

## Structure

```
mobile/
├── App.tsx                       root component, QueryClient, GestureHandler
├── app.json                      Expo config
├── babel.config.js
├── tsconfig.json
└── src/
    ├── shared/
    │   ├── api/
    │   │   ├── base.ts            API + WS URLs
    │   │   ├── client.ts          axios instance, auth interceptors
    │   │   ├── auth.ts            token refresh, ensureAccessToken
    │   │   └── websocket.ts       WsClient singleton
    │   ├── store/
    │   │   ├── auth.ts            tokens, session — persisted in SecureStore
    │   │   └── chat.ts            typing, online, unread, delivery statuses
    │   ├── crypto/
    │   │   └── e2ee.ts            P-256 keygen, SPKI conversion, SecureStore key ops
    │   └── theme.ts               design tokens (colors, spacing, radius, font sizes)
    ├── entities/
    │   ├── message/types.ts
    │   ├── chat/types.ts
    │   └── user/types.ts
    ├── navigation/
    │   └── index.tsx              NavigationContainer, auth guard, WS lifecycle
    └── screens/
        ├── LoginScreen.tsx
        ├── RegisterScreen.tsx
        ├── ChatListScreen.tsx
        ├── ChatScreen.tsx
        └── SettingsScreen.tsx
```

## API

The mobile app connects to the same backend as the web client:

- REST: `https://messenger.nikitakh.ru/api/v1`
- WebSocket: `wss://messenger.nikitakh.ru/ws?token=<access_token>`

No backend changes were required to support mobile clients. The `device_type: "mobile"` and `platform: "ios"|"android"` fields are included in auth requests for analytics.

## Crypto

The mobile app uses `@noble/curves` (pure JS) instead of the Web Crypto API since the full Web Crypto API is not available on older React Native versions. The cryptographic operations are equivalent:

| Operation | Web (browser) | Mobile |
|---|---|---|
| P-256 keygen | `SubtleCrypto.generateKey` | `p256.utils.randomPrivateKey()` |
| ECDH | `SubtleCrypto.deriveBits` | `p256.getSharedSecret()` |
| HKDF-SHA-256 | `SubtleCrypto.deriveKey` | `hkdf(sha256, ...)` from `@noble/hashes` |
| Key storage | IndexedDB | `expo-secure-store` (Keychain/Keystore) |
| Public key format | SPKI base64 | SPKI base64 (manually serialized with fixed P-256 header) |

The SPKI serialization prefix for P-256 is a fixed 26-byte header:
```
30 59 30 13 06 07 2a 86 48 ce 3d 02 01
06 08 2a 86 48 ce 3d 03 01 07 03 42 00
```
followed by the 65-byte uncompressed public key (`04 || X || Y`).

## Screens

### Authentication

- **LoginScreen** — username + password → POST `/auth/login`; reuses stored key pair if present, generates a new one otherwise
- **RegisterScreen** — username + password → generates P-256 key pair → stores private key in SecureStore → POST `/auth/register`

Both screens use `react-native-reanimated` `FadeInDown` / `FadeInUp` enter animations.

### ChatListScreen

- Shows all chats via GET `/chats`
- Displays unread badges from `useChatStore`
- Last message preview populated by WS `message.new` events
- FAB opens a menu to create a direct chat or group
- Direct chat: user search via GET `/users/search?q=` → POST `/chats/direct`
- Group chat: user search + group title → POST `/chats/group`

### ChatScreen

- Message history via GET `/chats/{id}/messages` (50 most recent)
- Real-time updates from WS `message.new`
- `FlashList` with `inverted={true}` — newest messages at the bottom
- Date separators are injected into the list data array
- Typing indicator with Reanimated animated dots (3-dot staggered bounce)
- Delivery status icons (✓ sent, ✓✓ delivered, ✓✓ blue = read)
- Image/file attachment via `expo-image-picker` → POST `/attachments/upload` → send message with `attachment_id`
- Images displayed inline (downloaded with auth header, converted to base64 URI)
- Typing events: `typing.started` / `typing.stopped` sent via WS, auto-stop after 3s idle

### SettingsScreen

- GET `/users/me` — shows username, email
- Shows device ID and key fingerprint (tappable to copy)
- Logout: POST `/auth/logout` + disconnect WS + clear Zustand store

## Building

### Development

```bash
cd mobile
npm install
npx expo start
# scan QR with Expo Go
```

### Production APK (Android)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

### Production IPA (iOS)

```bash
eas build -p ios --profile preview
```

The `eas.json` should be created before building:

```json
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "production": {
      "android": { "buildType": "aab" }
    }
  }
}
```
