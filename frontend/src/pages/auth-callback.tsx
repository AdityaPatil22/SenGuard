import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/store/auth";
import api from "@/services/api";
import type { ApiResponse, AuthResponse } from "@/types/api";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuthStore();
  const [error, setError] = useState("");
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("No authorization code received");
      return;
    }

    api
      .post<ApiResponse<AuthResponse>>("/auth/github/callback", { code })
      .then(({ data }) => {
        if (data.success && data.data) {
          login(data.data.access_token, data.data.refresh_token);
          navigate("/", { replace: true });
        } else {
          setError("Authentication failed");
        }
      })
      .catch(() => setError("Authentication failed"));
  }, [login, navigate]);

  if (isAuthenticated) return <Navigate to="/" replace />;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <a href="/" className="text-primary hover:underline text-sm">
            Back to home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing in...</p>
    </div>
  );
}
