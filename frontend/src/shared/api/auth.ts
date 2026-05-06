import axios from "axios";

import { useAuthStore } from "@/shared/store/auth";
import { BASE_URL } from "@/shared/api/base";

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

let refreshPromise: Promise<string | null> | null = null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(normalized)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenFresh(token: string, skewSeconds = 10): boolean {
  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) return false;
  return exp > Math.floor(Date.now() / 1000) + skewSeconds;
}

export async function refreshAccessToken(): Promise<string | null> {
  const store = useAuthStore.getState();
  if (!store.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await axios.post<RefreshResponse>(`${BASE_URL}/auth/refresh`, {
          refresh_token: store.refreshToken,
        });
        const { access_token, refresh_token } = response.data;
        useAuthStore.getState().setTokens(access_token, refresh_token);
        return access_token;
      } catch {
        useAuthStore.getState().logout();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export async function ensureAccessToken(): Promise<string | null> {
  const token = useAuthStore.getState().accessToken;
  if (token && isTokenFresh(token)) {
    return token;
  }
  return refreshAccessToken();
}
