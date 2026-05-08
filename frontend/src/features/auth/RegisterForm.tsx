import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/shared/api/client";
import { useAuthStore } from "@/shared/store/auth";
import { generateIdentityKeyPair, exportPublicKey, computeFingerprint, storeKeyPair } from "@/shared/crypto/e2ee";

const schema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, digits, _ . - only"),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const keyPair = await generateIdentityKeyPair();
      const publicKey = await exportPublicKey(keyPair.publicKey);
      const fingerprint = await computeFingerprint(keyPair.publicKey);

      // Key pair is stored in IndexedDB — private key never sent to backend
      await storeKeyPair(keyPair, fingerprint);

      const res = await apiClient.post("/auth/register", {
        username: values.username,
        email: values.email || undefined,
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
          autoComplete="username"
        />
        {errors.username && <p className="text-destructive text-xs mt-1">{errors.username.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Email (optional)</label>
        <input
          {...register("email")}
          type="email"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          {...register("password")}
          type="password"
          className="w-full border rounded px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Confirm Password</label>
        <input
          {...register("confirmPassword")}
          type="password"
          className="w-full border rounded px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        {errors.confirmPassword && <p className="text-destructive text-xs mt-1">{errors.confirmPassword.message}</p>}
      </div>
      {mutation.error && (
        <p className="text-destructive text-sm">Registration failed. Try a different username.</p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium disabled:opacity-50"
      >
        {mutation.isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

