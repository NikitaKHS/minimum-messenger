import axios, { type AxiosInstance } from "axios";
import { useAuthStore } from "@/shared/store/auth";

const BASE_URL = "/api/v1";

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach access token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh token on 401
let _refreshing: Promise<string | null> | null = null;

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (!_refreshing) {
        _refreshing = (async () => {
          const store = useAuthStore.getState();
          if (!store.refreshToken) return null;
          try {
            const res = await axios.post(`${BASE_URL}/auth/refresh`, {
              refresh_token: store.refreshToken,
            });
            const { access_token, refresh_token } = res.data;
            store.setTokens(access_token, refresh_token);
            return access_token;
          } catch {
            store.logout();
            return null;
          } finally {
            _refreshing = null;
          }
        })();
      }

      const newToken = await _refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
    }
    return Promise.reject(error);
  }
);
