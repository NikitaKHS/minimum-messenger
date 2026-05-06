import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/shared/store/auth";
import { apiClient } from "@/shared/api/client";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { refreshToken, logout } = useAuthStore();

  const handleLogout = async () => {
    if (refreshToken) {
      await apiClient.post("/auth/logout", { refresh_token: refreshToken }).catch(() => {});
    }
    logout();
    navigate("/login");
  };

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>
      <div className="space-y-4">
        <button
          onClick={() => navigate("/devices")}
          className="w-full text-left border rounded px-4 py-3 hover:bg-accent text-sm"
        >
          Manage devices
        </button>
        <button
          onClick={() => navigate("/admin")}
          className="w-full text-left border rounded px-4 py-3 hover:bg-accent text-sm"
        >
          Admin tools
        </button>
        <a
          href="/grafana/"
          target="_blank"
          rel="noreferrer"
          className="block w-full text-left border rounded px-4 py-3 hover:bg-accent text-sm"
        >
          Open Grafana
        </a>
        <button
          onClick={handleLogout}
          className="w-full text-left border border-destructive text-destructive rounded px-4 py-3 hover:bg-destructive/10 text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
