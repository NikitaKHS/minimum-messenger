import axios, { type AxiosInstance } from 'axios';
import { BASE_URL } from './base';

let _getState: (() => { accessToken: string | null }) | null = null;
let _refresh: (() => Promise<string | null>) | null = null;

export function initApiClient(
  getState: () => { accessToken: string | null },
  refresh: () => Promise<string | null>,
) {
  _getState = getState;
  _refresh = refresh;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = _getState?.().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && _refresh) {
      original._retry = true;
      const newToken = await _refresh();
      if (newToken) {
        original.headers ??= {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
    }
    return Promise.reject(error);
  },
);
