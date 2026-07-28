import { createBrowserRouter } from "react-router-dom";

import { AppLayout } from "@/layouts/app-layout";
import { AuthCallbackPage } from "@/pages/auth-callback";
import { DashboardPage } from "@/pages/dashboard";
import { DatasetsPage } from "@/pages/datasets";
import { EvaluationsPage } from "@/pages/evaluations";
import { ProjectsPage } from "@/pages/projects";
import { ReportsPage } from "@/pages/reports";
import { SettingsPage } from "@/pages/settings";

export const router = createBrowserRouter([
  {
    path: "/auth/callback",
    element: <AuthCallbackPage />,
  },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "datasets", element: <DatasetsPage /> },
      { path: "evaluations", element: <EvaluationsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
