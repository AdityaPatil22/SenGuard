import { createBrowserRouter, Navigate } from "react-router-dom";

import { useAuthStore } from "@/store/auth";
import { AppLayout } from "@/layouts/app-layout";
import { AuthCallbackPage } from "@/pages/auth-callback";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { DatasetsPage } from "@/pages/datasets";
import { EvaluationsPage } from "@/pages/evaluations";
import { EvaluationDetailPage } from "@/pages/evaluation-detail";
import { ProjectsPage } from "@/pages/projects";
import { ProjectDetailPage } from "@/pages/project-detail";
import { ReportsPage } from "@/pages/reports";
import { ReportDetailPage } from "@/pages/report-detail";
import { SettingsPage } from "@/pages/settings";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/auth/callback",
    element: <AuthCallbackPage />,
  },
  {
    path: "/",
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:id", element: <ProjectDetailPage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "evaluations", element: <EvaluationsPage /> },
      { path: "evaluations/:id", element: <EvaluationDetailPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "reports/:id", element: <ReportDetailPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
