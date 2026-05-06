import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiClient } from "@/shared/api/client";

type AdminHealth = {
  status: string;
  users: number;
  active_devices: number;
};

type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  status: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  user_id: string | null;
  device_id: string | null;
  event_type: string;
  ip: string | null;
  created_at: string;
};

const STORAGE_KEY = "minimum-admin-key";

function useAdminHeaders(adminKey: string) {
  return useMemo(
    () => ({
      headers: {
        "X-Admin-Key": adminKey,
      },
    }),
    [adminKey]
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? "");
  const [draftKey, setDraftKey] = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? "");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const headers = useAdminHeaders(adminKey);

  const { data: health, error: healthError, isFetching: healthLoading } = useQuery<AdminHealth>({
    queryKey: ["admin-health", adminKey],
    queryFn: async () => {
      const res = await apiClient.get("/admin/system/health", headers);
      return res.data;
    },
    enabled: adminKey.length > 0,
    retry: false,
  });

  const { data: users = [], isFetching: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users", adminKey],
    queryFn: async () => {
      const res = await apiClient.get("/admin/users", {
        ...headers,
        params: { limit: 20 },
      });
      return res.data;
    },
    enabled: adminKey.length > 0,
    retry: false,
  });

  const { data: auditRows = [], isFetching: auditLoading } = useQuery<AuditRow[]>({
    queryKey: ["admin-audit", adminKey, selectedUserId],
    queryFn: async () => {
      const res = await apiClient.get("/admin/audit", {
        ...headers,
        params: { limit: 30, user_id: selectedUserId ?? undefined },
      });
      return res.data;
    },
    enabled: adminKey.length > 0,
    retry: false,
  });

  const banMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(`/admin/users/${userId}/ban`, null, headers);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users", adminKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit", adminKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-health", adminKey] });
    },
  });

  function applyAdminKey() {
    const value = draftKey.trim();
    setAdminKey(value);
    if (value) {
      sessionStorage.setItem(STORAGE_KEY, value);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function clearAdminKey() {
    setDraftKey("");
    setAdminKey("");
    setSelectedUserId(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Minimum</p>
            <h1 className="text-2xl font-semibold">Admin tools</h1>
            <p className="text-sm text-muted-foreground mt-1">
              User management, audit trail and quick links for the running instance.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/settings" className="border rounded px-4 py-2 text-sm hover:bg-accent">
              Back to settings
            </Link>
            <a
              href="/grafana/"
              target="_blank"
              rel="noreferrer"
              className="border rounded px-4 py-2 text-sm hover:bg-accent"
            >
              Grafana
            </a>
          </div>
        </div>

        <section className="border rounded-xl p-4 md:p-5 bg-card shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2">Admin secret key</label>
              <input
                type="password"
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder="X-Admin-Key"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={applyAdminKey}
              className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-medium"
            >
              Connect
            </button>
            <button
              onClick={clearAdminKey}
              className="border rounded px-4 py-2 text-sm hover:bg-accent"
            >
              Clear
            </button>
          </div>
          {healthError && (
            <p className="text-sm text-destructive mt-3">
              Admin key was rejected or the admin API is unavailable.
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Backend status"
            value={health?.status ?? (healthLoading ? "Loading..." : "Locked")}
          />
          <StatCard
            title="Users"
            value={health ? String(health.users) : healthLoading ? "..." : "0"}
          />
          <StatCard
            title="Active devices"
            value={health ? String(health.active_devices) : healthLoading ? "..." : "0"}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border rounded-xl bg-card shadow-sm">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h2 className="font-medium">Users</h2>
                <p className="text-xs text-muted-foreground">Latest registered accounts</p>
              </div>
              {usersLoading && <span className="text-xs text-muted-foreground">Refreshing...</span>}
            </div>
            <div className="divide-y">
              {users.length === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Add the admin key to load users.
                </div>
              )}
              {users.map((user) => (
                <div key={user.id} className="px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <button
                      onClick={() => setSelectedUserId((current) => (current === user.id ? null : user.id))}
                      className="text-left"
                    >
                      <p className="font-medium truncate">@{user.username}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email ?? "No email"} · {user.status}
                      </p>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedUserId === user.id && (
                      <span className="text-xs rounded-full bg-secondary px-2 py-1 text-secondary-foreground">
                        audit filter
                      </span>
                    )}
                    {user.status !== "banned" && (
                      <button
                        onClick={() => banMutation.mutate(user.id)}
                        disabled={banMutation.isPending}
                        className="border border-destructive text-destructive rounded px-3 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded-xl bg-card shadow-sm">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h2 className="font-medium">Audit</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedUserId ? "Filtered by selected user" : "Recent activity"}
                </p>
              </div>
              {selectedUserId && (
                <button
                  onClick={() => setSelectedUserId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset filter
                </button>
              )}
            </div>
            <div className="divide-y max-h-[540px] overflow-y-auto">
              {auditRows.length === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  {auditLoading ? "Loading audit..." : "No audit rows to show."}
                </div>
              )}
              {auditRows.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <p className="text-sm font-medium">{row.event_type}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 break-all">
                    user: {row.user_id ?? "n/a"} · device: {row.device_id ?? "n/a"}
                  </p>
                  {row.ip && (
                    <p className="text-xs text-muted-foreground mt-1 break-all">ip: {row.ip}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded-xl p-4 bg-card shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold mt-3">{value}</p>
    </div>
  );
}
