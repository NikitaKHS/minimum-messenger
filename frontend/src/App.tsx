import { Route, Routes, Navigate } from "react-router-dom";
import { useAuthStore } from "@/shared/store/auth";
import LoginPage from "@/pages/login/LoginPage";
import RegisterPage from "@/pages/register/RegisterPage";
import ChatsPage from "@/pages/chats/ChatsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import DevicesPage from "@/pages/devices/DevicesPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);
  return isAuthenticated ? <Navigate to="/chats" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
      <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
      <Route path="/chats" element={<RequireAuth><ChatsPage /></RequireAuth>} />
      <Route path="/chats/:chatId" element={<RequireAuth><ChatsPage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="/devices" element={<RequireAuth><DevicesPage /></RequireAuth>} />
      <Route path="/" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}
