import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/shared/store/auth";
import { apiClient } from "@/shared/api/client";
import type { UserMe } from "@/entities/user/types";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { refreshToken, logout } = useAuthStore();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const { data: me } = useQuery<UserMe>({
    queryKey: ["users", "me"],
    queryFn: async () => (await apiClient.get("/users/me")).data as UserMe,
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      await apiClient.patch("/users/me", {
        current_password: currentPassword,
        new_password: newPassword,
      });
    },
    onSuccess: () => {
      setPwSuccess(true);
      setPwError("");
      setCurrentPassword("");
      setNewPassword("");
      setShowPasswordForm(false);
    },
    onError: () => setPwError("Неверный текущий пароль"),
  });

  const handleLogout = async () => {
    if (refreshToken) {
      await apiClient.post("/auth/logout", { refresh_token: refreshToken }).catch(() => {});
    }
    logout();
    navigate("/login");
  };

  const username = me?.username ?? "…";
  const fingerprint = me?.public_key_fingerprint;
  const fmtFp = fingerprint
    ? fingerprint.match(/.{1,8}/g)?.join(" ") ?? fingerprint
    : null;

  return (
    <div className="flex h-[100dvh] bg-background">
      {/* Sidebar navigation */}
      <aside className="hidden md:flex flex-col border-r bg-background w-64 flex-shrink-0">
        <div className="p-4 border-b flex items-center gap-2">
          <button onClick={() => navigate("/chats")} className="p-1 rounded hover:bg-accent transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-semibold">Профиль</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {[
            { label: "Чаты", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", path: "/chats" },
            { label: "Устройства", icon: "M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9l-6-6zm6 0v6h6M8 13h8M8 17h5", path: "/devices" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-6">
          {/* Back button for mobile */}
          <button
            onClick={() => navigate("/chats")}
            className="md:hidden flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>

          {/* Avatar + username */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary select-none">
              {username[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <h1 className="text-xl font-semibold">@{username}</h1>
              {me?.email && <p className="text-sm text-muted-foreground">{me.email}</p>}
            </div>
          </div>

          {/* Encryption key */}
          {fmtFp && (
            <section className="rounded-xl border p-4 space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Отпечаток ключа шифрования
              </h2>
              <p className="text-xs font-mono text-muted-foreground break-all bg-muted px-3 py-2 rounded-lg">
                {fmtFp}
              </p>
              <p className="text-xs text-muted-foreground">
                Сравните с собеседником для подтверждения безопасности переписки
              </p>
            </section>
          )}

          {/* Change password */}
          <section className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Изменить пароль</h2>
              <button
                onClick={() => { setShowPasswordForm(!showPasswordForm); setPwError(""); setPwSuccess(false); }}
                className="text-xs text-primary hover:underline"
              >
                {showPasswordForm ? "Отмена" : "Изменить"}
              </button>
            </div>
            {showPasswordForm && (
              <div className="space-y-2">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Текущий пароль"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новый пароль"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {pwError && <p className="text-destructive text-xs">{pwError}</p>}
                {pwSuccess && <p className="text-green-500 text-xs">Пароль изменён</p>}
                <button
                  onClick={() => changePasswordMutation.mutate()}
                  disabled={!currentPassword || newPassword.length < 8 || changePasswordMutation.isPending}
                  className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {changePasswordMutation.isPending ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            )}
          </section>

          {/* Links */}
          <section className="rounded-xl border overflow-hidden divide-y">
            <button
              onClick={() => navigate("/devices")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-sm"
            >
              <span>Управление устройствами</span>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <a
              href="/grafana/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-sm"
            >
              <span>Grafana</span>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <button
              onClick={() => navigate("/admin")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-sm"
            >
              <span>Панель администратора</span>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </section>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 border border-destructive text-destructive rounded-xl px-4 py-3 hover:bg-destructive/10 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Выйти
          </button>
        </div>
      </main>
    </div>
  );
}
