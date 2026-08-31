import { FileText, Github, Moon, RefreshCw, Shield, Sun, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth";
import { useCurrentUser, useUserRole } from "@/hooks/use-current-user";
import { useThemeStore } from "@/store/theme";
import api from "@/services/api";
import type { ApiResponse } from "@/types/api";

function AccountCard() {
  const { isAuthenticated, logout } = useAuthStore();
  const { data: user, isLoading: loading } = useCurrentUser();

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Sign in to manage your account</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">You are not signed in.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
        <CardDescription>Your GitHub account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.github_username}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <AvatarFallback className="text-base">{user?.github_username?.charAt(0).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div>
            <p className="text-sm font-medium">{user?.github_username}</p>
            {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
          </div>
        </div>

        <Separator />

        <div className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Provider</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Github className="h-3.5 w-3.5" />
              GitHub
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary" className="capitalize">{user?.role}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs text-muted-foreground">{user?.id?.slice(0, 8)}</span>
          </div>
        </div>

        <Separator />

        <Button variant="destructive" size="sm" onClick={() => { logout(); toast.success("Signed out"); }}>
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

interface ManagedUser {
  id: string;
  github_username: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function UserManagementCard() {
  const { data: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResponse<ManagedUser[]>>("/users")
      .then(({ data }) => {
        if (data.success) setUsers(data.data);
      })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(userId: string, role: string) {
    try {
      await api.patch(`/users/${userId}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
  }

  async function handleDeactivate(userId: string) {
    try {
      await api.patch(`/users/${userId}/deactivate`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: false } : u)));
      toast.success("User deactivated");
    } catch {
      toast.error("Failed to deactivate user");
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Management</CardTitle>
          <CardDescription>Manage user roles and access</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          User Management
        </CardTitle>
        <CardDescription>Manage user roles and access</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div key={u.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar className="h-8 w-8">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.github_username} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <AvatarFallback className="text-xs">{u.github_username.charAt(0).toUpperCase()}</AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {u.github_username}
                    {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
                  </p>
                  {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                </div>
                {!u.is_active && <Badge variant="destructive">Inactive</Badge>}
                {u.is_active && !isSelf && (
                  <>
                    <Select value={u.role} onValueChange={(val) => val && handleRoleChange(u.id, val)}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="reviewer">Reviewer</SelectItem>
                        <SelectItem value="developer">Developer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeactivate(u.id)}
                      title="Deactivate user"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {u.is_active && isSelf && (
                  <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  user_id: string | null;
  created_at: string;
}

function AuditLogCard() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchLogs = useCallback((resourceType?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (resourceType) params.set("resource_type", resourceType);
    api
      .get<ApiResponse<AuditLogEntry[]>>(`/audit-logs?${params}`)
      .then(({ data }) => {
        if (data.success) setLogs(data.data);
      })
      .catch(() => toast.error("Failed to load audit logs"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs(filter || undefined);
  }, [filter, fetchLogs]);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  function actionLabel(action: string) {
    return action.replace(/_/g, " ");
  }

  const resourceTypes = [...new Set(logs.map((l) => l.resource_type))];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Audit Log
            </CardTitle>
            <CardDescription>Recent security and admin activity</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => fetchLogs(filter || undefined)}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {resourceTypes.length > 1 && (
          <div className="flex gap-1.5 mb-4 flex-wrap">
            <Button
              variant={filter === "" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("")}
            >
              All
            </Button>
            {resourceTypes.map((rt) => (
              <Button
                key={rt}
                variant={filter === rt ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => setFilter(rt)}
              >
                {rt}
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No audit logs found.</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                      {log.resource_type}
                    </Badge>
                    <span className="text-sm capitalize truncate">{actionLabel(log.action)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(log.created_at)}</span>
                </div>
                {log.details && (
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[calc(theme(spacing.2)+1px)]">{log.details}</p>
                )}
                {log.resource_id && (
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 ml-[calc(theme(spacing.2)+1px)]">
                    {log.resource_id.slice(0, 8)}
                    {log.user_id && <span> · by {log.user_id.slice(0, 8)}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { theme, toggle } = useThemeStore();
  const role = useUserRole();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Customize the interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggle} className="gap-2">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AccountCard />

      {role === "admin" && <UserManagementCard />}
      {role === "admin" && <AuditLogCard />}
    </div>
  );
}
