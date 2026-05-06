import { Link } from "react-router-dom";
import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/icon.png" alt="Minimum" className="w-12 h-12 mb-3" />
          <h1 className="text-2xl font-semibold">Minimum</h1>
          <p className="text-muted-foreground text-sm mt-1">End-to-end encrypted</p>
        </div>
        <div className="bg-card border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">Create account</h2>
          <RegisterForm />
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
