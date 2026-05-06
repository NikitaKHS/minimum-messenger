import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/shared/api/client";
import { useAuthStore } from "@/shared/store/auth";
import { generateIdentityKeyPair, exportPublicKey, computeFingerprint } from "@/shared/crypto/e2ee";

const schema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Reuse the stored identity key pair if available; generate a new one only
      // if this is a fresh browser/device with no key material yet.
      let keyPair: CryptoKeyPair;
      const stored = await loadKeyPair();
      if (stored) {
        keyPair = stored;
      } else {
        keyPair = await generateIdentityKeyPair();
        const fp = await computeFingerprint(keyPair.publicKey);
        await storeKeyPair(keyPair, fp);
      }

      const publicKey = await exportPublicKey(keyPair.publicKey);
      const fingerprint = await computeFingerprint(keyPair.publicKey);

      const res = await apiClient.post("/auth/login", {
        username: values.username,
        password: values.password,
        device_name: navigator.userAgent.slice(0, 128),
        device_type: "web",
        public_identity_key: publicKey,
        public_key_fingerprint: fingerprint,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSession(data.access_token, data.refresh_token, data.user_id, data.device_id);
      navigate("/chats");
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Username</label>
        <input
          {...register("username")}
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="your_username"
          autoComplete="username"
        />
        {errors.username && <p className="text-destructive text-xs mt-1">{errors.username.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          {...register("password")}
          type="password"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="••••••••"
          autoComplete="current-password"
        />
        {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
      </div>
      {mutation.error && (
        <p className="text-destructive text-sm">Invalid username or password</p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium disabled:opacity-50"
      >
        {mutation.isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("minimum-keys", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys", { keyPath: "fingerprint" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const req = tx.objectStore("keys").getAll();
    req.onsuccess = () => {
      const records = req.result as Array<{ fingerprint: string; privateKey: CryptoKey; publicKey: CryptoKey }>;
      resolve(records.length > 0 ? { privateKey: records[0].privateKey, publicKey: records[0].publicKey } : null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function storeKeyPair(keyPair: CryptoKeyPair, fingerprint: string): Promise<void> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put({ fingerprint, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
