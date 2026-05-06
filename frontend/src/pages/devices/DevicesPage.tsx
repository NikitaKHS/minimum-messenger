import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/api/client";
import type { Device } from "@/entities/user/types";

export default function DevicesPage() {
  const queryClient = useQueryClient();

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await apiClient.get("/devices");
      return res.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (deviceId: string) => apiClient.delete(`/devices/${deviceId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Загрузка…</div>;

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-xl font-semibold mb-6">Устройства</h1>
      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={device.id}
            className="border rounded-lg px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="font-medium text-sm">{device.device_name}</p>
              <p className="text-xs text-muted-foreground">
                {device.device_type} · {device.platform ?? "Unknown"} ·{" "}
                {device.is_active ? "Активно" : "Отозвано"}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {device.public_key_fingerprint.slice(0, 16)}…
              </p>
            </div>
            {device.is_active && (
              <button
                onClick={() => revokeMutation.mutate(device.id)}
                disabled={revokeMutation.isPending}
                className="text-destructive text-sm hover:underline disabled:opacity-50"
              >
                Отозвать
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
