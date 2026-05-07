import axios from 'axios';
import { BASE_URL } from './base';

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

let _getStore: (() => { refreshToken: string | null; setTokens: (a: string, r: string) => void; logout: () => void }) | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function initAuthApi(
  getStore: () => { refreshToken: string | null; setTokens: (a: string, r: string) => void; logout: () => void },
) {
  _getStore = getStore;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenFresh(token: string, skewSeconds = 10): boolean {
  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp : null;
  if (!exp) return false;
  return exp > Math.floor(Date.now() / 1000) + skewSeconds;
}

export async function refreshAccessToken(): Promise<string | null> {
  const store = _getStore?.();
  if (!store?.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await axios.post<RefreshResponse>(`${BASE_URL}/auth/refresh`, {
          refresh_token: store.refreshToken,
        });
        const { access_token, refresh_token } = res.data;
        store.setTokens(access_token, refresh_token);
        return access_token;
      } catch {
        store.logout();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export async function ensureAccessToken(
  getToken: () => string | null,
): Promise<string | null> {
  const token = getToken();
  if (token && isTokenFresh(token)) return token;
  return refreshAccessToken();
}
