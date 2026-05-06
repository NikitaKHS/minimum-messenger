import axios, { type AxiosInstance } from "axios";
import { useAuthStore } from "@/shared/store/auth";
import { refreshAccessToken } from "@/shared/api/auth";
import { BASE_URL } from "@/shared/api/base";

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
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers ??= {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
    }
    return Promise.reject(error);
  }
);
