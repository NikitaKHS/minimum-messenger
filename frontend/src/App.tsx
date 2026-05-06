import { Route, Routes, Navigate } from "react-router-dom";
import { useEffect } from "react";

import { useAuthStore } from "@/shared/store/auth";
import { refreshAccessToken } from "@/shared/api/auth";
import LoginPage from "@/pages/login/LoginPage";
import RegisterPage from "@/pages/register/RegisterPage";
import ChatsPage from "@/pages/chats/ChatsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import DevicesPage from "@/pages/devices/DevicesPage";
import AdminPage from "@/pages/admin/AdminPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);
  return isAuthenticated ? <Navigate to="/chats" replace /> : <>{children}</>;
}

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const initialized = useAuthStore((s) => s.initialized);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    if (initialized) return;

    let cancelled = false;

    async function bootstrap() {
      if (!refreshToken || accessToken) {
        if (!cancelled) setInitialized(true);
        return;
      }

      await refreshAccessToken();
      if (!cancelled) setInitialized(true);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, initialized, refreshToken, setInitialized]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
        Loading session...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
      <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
      <Route path="/chats" element={<RequireAuth><ChatsPage /></RequireAuth>} />
      <Route path="/chats/:chatId" element={<RequireAuth><ChatsPage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/devices" element={<RequireAuth><DevicesPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      <Route path="/" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}
