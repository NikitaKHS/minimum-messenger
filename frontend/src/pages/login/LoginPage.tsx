import { Link } from "react-router-dom";
import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/icon.png" alt="Minimum" className="w-12 h-12 mb-3" />
          <h1 className="text-2xl font-semibold">Minimum</h1>
          <p className="text-muted-foreground text-sm mt-1">End-to-end encrypted</p>
        </div>
        <div className="bg-card border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Sign in</h2>
          <LoginForm />
          <p className="text-center text-sm text-muted-foreground mt-4">
            No account?{" "}
            <Link to="/register" className="text-primary hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
