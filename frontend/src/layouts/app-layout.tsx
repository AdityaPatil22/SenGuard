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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { useThemeStore } from "@/store/theme";
import api from "@/services/api";
import type { ApiResponse } from "@/types/api";
import type { User as UserType } from "@/types/api";

const NAV_GROUPS = [
  {
    items: [{ label: "Dashboard", to: "/", icon: LayoutDashboard }],
  },
  {
    label: "Setup",
    items: [
      { label: "Projects", to: "/projects", icon: FolderKanban },
      { label: "Datasets", to: "/datasets", icon: Database },
    ],
  },
  {
    label: "Results",
    items: [
      { label: "Evaluations", to: "/evaluations", icon: FlaskConical },
      { label: "Reports", to: "/reports", icon: FileText },
    ],
  },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4" : ""}>
          {group.label && (
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function ProfileButton() {
  const { isAuthenticated, logout } = useAuthStore();
  const [user, setUser] = useState<UserType | null>(null);
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
      <Button size="sm" onClick={handleLogin} disabled={loading} className="gap-2">
        <Github className="h-4 w-4" />
        {loading ? "Connecting..." : "Sign in with GitHub"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-accent transition-colors outline-none"
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
        {user && <span className="hidden sm:inline text-sm font-medium text-foreground">{user.github_username}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {user && (
          <>
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{user.github_username}</p>
              {user.email && <p className="text-muted-foreground text-xs truncate">{user.email}</p>}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="text-destructive gap-2" onClick={() => { logout(); toast.success("Signed out"); }}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const { theme, toggle } = useThemeStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar-background md:flex">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <Link to="/" className="text-[15px] font-semibold tracking-tight text-foreground">
            Sentinel AI
          </Link>
        </div>
        <Separator className="bg-sidebar-border" />
        <div className="flex flex-1 flex-col p-3">
          <SidebarNav />
          <div className="mt-auto pt-3 border-t border-sidebar-border">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <Settings className="h-4 w-4" />
              Settings
            </NavLink>
          </div>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-[15px] font-semibold">Sentinel AI</span>
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b px-4 gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle} className="text-muted-foreground">
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
