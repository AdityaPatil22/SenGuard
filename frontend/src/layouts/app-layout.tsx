import {
  Database,
  FileText,
  FlaskConical,
  FolderKanban,
  Github,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth";
import { useThemeStore } from "@/store/theme";
import api from "@/services/api";
import type { ApiResponse } from "@/types/api";
import type { User as UserType } from "@/types/api";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Datasets", to: "/datasets", icon: Database },
  { label: "Evaluations", to: "/evaluations", icon: FlaskConical },
  { label: "Reports", to: "/reports", icon: FileText },
  { label: "Settings", to: "/settings", icon: Settings },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ProfileButton() {
  const { isAuthenticated, logout } = useAuthStore();
  const [user, setUser] = useState<UserType | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setUser(null);
      return;
    }
    api
      .get<ApiResponse<UserType>>("/auth/me")
      .then(({ data }) => {
        if (data.success && data.data) setUser(data.data);
      })
      .catch(() => setUser(null));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    async function handleLogin() {
      setLoading(true);
      try {
        const { data } = await api.get<ApiResponse<{ url: string }>>("/auth/github");
        if (data.success && data.data?.url) {
          window.location.href = data.data.url;
        }
      } catch {
        setLoading(false);
      }
    }

    return (
      <Button variant="ghost" size="sm" onClick={handleLogin} disabled={loading} className="gap-2">
        <Github className="h-4 w-4" />
        <span className="hidden sm:inline">{loading ? "Connecting..." : "Sign in"}</span>
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent transition-colors"
      >
        <Avatar className="h-7 w-7">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.github_username} className="h-full w-full rounded-full object-cover" />
          ) : (
            <AvatarFallback>
              <User className="h-3.5 w-3.5" />
            </AvatarFallback>
          )}
        </Avatar>
        {user && (
          <span className="hidden sm:inline text-sm font-medium text-foreground">
            {user.github_username}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-md">
            {user && (
              <>
                <div className="px-3 py-2 text-sm">
                  <p className="font-medium">{user.github_username}</p>
                  {user.email && (
                    <p className="text-muted-foreground text-xs truncate">{user.email}</p>
                  )}
                </div>
                <Separator />
              </>
            )}
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppLayout() {
  const { theme, toggle } = useThemeStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r border-sidebar-border bg-sidebar-background md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <Shield className="h-5 w-5 text-primary" />
          <Link to="/" className="text-base font-semibold tracking-tight text-foreground">
            Sentinel AI
          </Link>
        </div>
        <Separator className="bg-sidebar-border" />
        <div className="flex flex-1 flex-col p-3">
          <SidebarNav />
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent>
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold">Sentinel AI</span>
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b px-4 gap-2">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <ProfileButton />
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
