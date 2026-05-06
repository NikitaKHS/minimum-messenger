import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  deviceId: string | null;
  initialized: boolean;
  setTokens: (access: string, refresh: string) => void;
  setSession: (access: string, refresh: string, userId: string, deviceId: string) => void;
  setInitialized: (value: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      deviceId: null,
      initialized: false,
      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, initialized: true }),
      setSession: (access, refresh, userId, deviceId) =>
        set({ accessToken: access, refreshToken: refresh, userId, deviceId, initialized: true }),
      setInitialized: (value) =>
        set({ initialized: value }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          userId: null,
          deviceId: null,
          initialized: true,
        }),
    }),
    {
      name: "minimum-auth",
      // Only persist refresh token and IDs — access token is short-lived
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        userId: state.userId,
        deviceId: state.deviceId,
      }),
    }
  )
);
