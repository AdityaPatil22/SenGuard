import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/store/auth";
import api from "@/services/api";
import type { ApiResponse, AuthResponse } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ShieldAlert, ShieldCheck } from "lucide-react";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          {error ? (
            <>
              <ShieldAlert className="size-10 text-destructive" />
              <div className="text-center space-y-1">
                <p className="font-medium text-destructive">{error}</p>
                <p className="text-sm text-muted-foreground">
                  Please try signing in again.
                </p>
              </div>
              <a href="/">
                <Button variant="outline" size="sm">
                  Back to home
                </Button>
              </a>
            </>
          ) : (
            <>
              <ShieldCheck className="size-10 text-primary" />
              <div className="text-center space-y-1">
                <p className="font-medium">Signing in...</p>
                <p className="text-sm text-muted-foreground">
                  Authenticating with GitHub
                </p>
              </div>
              <Spinner className="size-6 text-primary" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
