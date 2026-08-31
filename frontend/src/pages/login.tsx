import { useState } from "react";
import { Github, Loader2, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/services/api";
import type { ApiResponse } from "@/types/api";

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<ApiResponse<{ url: string }>>("/auth/github");
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError("Failed to start authentication");
        setLoading(false);
      }
    } catch {
      setError("Could not connect to server");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-6 pt-8 pb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">SenGuard</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to access the AI governance platform
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button onClick={handleLogin} disabled={loading} className="w-full gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Github className="h-4 w-4" />
            )}
            {loading ? "Connecting..." : "Sign in with GitHub"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
