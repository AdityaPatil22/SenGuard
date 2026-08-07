7ceec35 feat: add project detail page with risk trending chart
---STAT---
 frontend/src/pages/project-detail.tsx | 180 ++++++++++++++++++++++++++++++++++
 frontend/src/pages/projects.tsx       |   7 +-
 frontend/src/routes/index.tsx         |   2 +
 3 files changed, 188 insertions(+), 1 deletion(-)
---DIFF---
diff --git a/frontend/src/pages/project-detail.tsx b/frontend/src/pages/project-detail.tsx
new file mode 100644
index 0000000..ee1ed32
--- /dev/null
+++ b/frontend/src/pages/project-detail.tsx
@@ -0,0 +1,180 @@
+import { useMemo } from "react";
+import { useParams, Link } from "react-router-dom";
+import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
+
+import { Badge } from "@/components/ui/badge";
+import {
+  Breadcrumb,
+  BreadcrumbItem,
+  BreadcrumbLink,
+  BreadcrumbList,
+  BreadcrumbPage,
+  BreadcrumbSeparator,
+} from "@/components/ui/breadcrumb";
+import { Button } from "@/components/ui/button";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Skeleton } from "@/components/ui/skeleton";
+import { useProjects } from "@/hooks/use-projects";
+import { useEvaluations } from "@/hooks/use-evaluations";
+import type { ProjectStatus } from "@/types/api";
+import { riskColor, riskLabel } from "@/lib/utils";
+
+const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
+  draft: "secondary",
+  submitted: "default",
+  evaluating: "warning",
+  evaluated: "default",
+  approved: "success",
+  rejected: "destructive",
+};
+
+function formatChartDate(iso: string) {
+  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
+}
+
+export function ProjectDetailPage() {
+  const { id } = useParams();
+  const { data: projects = [], isLoading: loadingProjects } = useProjects();
+  const { data: evaluations = [], isLoading: loadingEvals } = useEvaluations();
+
+  const project = projects.find((p) => p.id === id);
+
+  const chartData = useMemo(() => {
+    if (!id) return [];
+    return evaluations
+      .filter((e) => e.project_id === id && e.status === "completed" && e.risk_score != null)
+      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
+      .map((e) => ({
+        date: e.created_at,
+        score: e.risk_score!,
+        label: formatChartDate(e.created_at),
+      }));
+  }, [id, evaluations]);
+
+  const latestRiskScore = chartData.length > 0 ? chartData[chartData.length - 1]!.score : null;
+
+  const isLoading = loadingProjects || loadingEvals;
+
+  if (isLoading) {
+    return (
+      <div className="space-y-6">
+        <Skeleton className="h-5 w-48" />
+        <Skeleton className="h-24 w-full" />
+        <Skeleton className="h-64 w-full" />
+      </div>
+    );
+  }
+
+  if (!project) {
+    return (
+      <div className="flex flex-col items-center justify-center py-24 text-center">
+        <h2 className="text-lg font-semibold mb-2">Project not found</h2>
+        <p className="text-sm text-muted-foreground mb-4">
+          The project you're looking for doesn't exist or has been removed.
+        </p>
+        <Button variant="outline" size="sm" render={<Link to="/projects" />}>
+          Back to Projects
+        </Button>
+      </div>
+    );
+  }
+
+  return (
+    <div className="space-y-6">
+      <Breadcrumb>
+        <BreadcrumbList>
+          <BreadcrumbItem>
+            <BreadcrumbLink render={<Link to="/projects" />}>Projects</BreadcrumbLink>
+          </BreadcrumbItem>
+          <BreadcrumbSeparator />
+          <BreadcrumbItem>
+            <BreadcrumbPage>{project.name}</BreadcrumbPage>
+          </BreadcrumbItem>
+        </BreadcrumbList>
+      </Breadcrumb>
+
+      <div className="space-y-4">
+        <div className="flex items-start justify-between gap-4">
+          <div>
+            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
+            {project.description && (
+              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
+            )}
+          </div>
+          <div className="flex items-center gap-2">
+            <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
+            {latestRiskScore != null && (
+              <div className="flex items-center gap-2 pl-3 border-l">
+                <span className={`text-lg font-bold font-mono ${riskColor(latestRiskScore)}`}>
+                  {latestRiskScore.toFixed(0)}
+                </span>
+                <span className={`text-xs font-medium ${riskColor(latestRiskScore)}`}>
+                  {riskLabel(latestRiskScore)}
+                </span>
+              </div>
+            )}
+          </div>
+        </div>
+      </div>
+
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-base">Risk Trending</CardTitle>
+        </CardHeader>
+        <CardContent>
+          {chartData.length === 0 ? (
+            <div className="flex items-center justify-center py-16 text-center">
+              <p className="text-sm text-muted-foreground">No completed evaluations yet</p>
+            </div>
+          ) : chartData.length === 1 ? (
+            <div className="flex items-center justify-center py-16 text-center">
+              <p className="text-sm text-muted-foreground">
+                Run at least two evaluations to see a trend line
+              </p>
+            </div>
+          ) : (
+            <ResponsiveContainer width="100%" height={300}>
+              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
+                <XAxis
+                  dataKey="label"
+                  stroke="var(--muted-foreground)"
+                  fontSize={12}
+                  tickLine={false}
+                  axisLine={false}
+                />
+                <YAxis
+                  domain={[0, 100]}
+                  stroke="var(--muted-foreground)"
+                  fontSize={12}
+                  tickLine={false}
+                  axisLine={false}
+                />
+                <Tooltip
+                  contentStyle={{
+                    backgroundColor: "var(--card)",
+                    border: "1px solid var(--border)",
+                    borderRadius: "var(--radius)",
+                    color: "var(--foreground)",
+                  }}
+                  labelStyle={{ color: "var(--foreground)" }}
+                  itemStyle={{ color: "var(--chart-1)" }}
+                />
+                <ReferenceLine y={25} stroke="var(--success)" strokeDasharray="3 3" />
+                <ReferenceLine y={50} stroke="var(--warning)" strokeDasharray="3 3" />
+                <ReferenceLine y={75} stroke="var(--destructive)" strokeDasharray="3 3" />
+                <Line
+                  type="monotone"
+                  dataKey="score"
+                  stroke="var(--chart-1)"
+                  strokeWidth={2}
+                  dot={{ fill: "var(--chart-1)", r: 4 }}
+                  activeDot={{ r: 6 }}
+                />
+              </LineChart>
+            </ResponsiveContainer>
+          )}
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/frontend/src/pages/projects.tsx b/frontend/src/pages/projects.tsx
index 7fc1d32..10e9be5 100644
--- a/frontend/src/pages/projects.tsx
+++ b/frontend/src/pages/projects.tsx
@@ -1,12 +1,13 @@
 import { FolderKanban, Github, Pencil, Plus, Search, Trash2 } from "lucide-react";
 import { useState, useMemo, type FormEvent } from "react";
+import { Link } from "react-router-dom";
 import { toast } from "sonner";
 
 import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
@@ -218,21 +219,25 @@ export function ProjectsPage() {
                 <TableHead>Status</TableHead>
                 <TableHead className="hidden lg:table-cell">Repository</TableHead>
                 <TableHead className="hidden md:table-cell">Description</TableHead>
                 <TableHead className="hidden sm:table-cell">Created</TableHead>
                 <TableHead className="w-24" />
               </TableRow>
             </TableHeader>
             <TableBody>
               {filteredProjects.map((p) => (
                 <TableRow key={p.id}>
-                  <TableCell className="font-medium">{p.name}</TableCell>
+                  <TableCell className="font-medium">
+                    <Link to={`/projects/${p.id}`} className="hover:underline underline-offset-4">
+                      {p.name}
+                    </Link>
+                  </TableCell>
                   <TableCell>
                     <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                   </TableCell>
                   <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                     {p.repo_full_name ? (
                       <a
                         href={p.repo_url ?? "#"}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="hover:underline flex items-center gap-1"
diff --git a/frontend/src/routes/index.tsx b/frontend/src/routes/index.tsx
index 57021fb..628c16d 100644
--- a/frontend/src/routes/index.tsx
+++ b/frontend/src/routes/index.tsx
@@ -1,34 +1,36 @@
 import { createBrowserRouter, Navigate } from "react-router-dom";
 
 import { AppLayout } from "@/layouts/app-layout";
 import { AuthCallbackPage } from "@/pages/auth-callback";
 import { DashboardPage } from "@/pages/dashboard";
 import { DatasetsPage } from "@/pages/datasets";
 import { EvaluationsPage } from "@/pages/evaluations";
 import { EvaluationDetailPage } from "@/pages/evaluation-detail";
 import { ProjectsPage } from "@/pages/projects";
+import { ProjectDetailPage } from "@/pages/project-detail";
 import { ReportsPage } from "@/pages/reports";
 import { ReportDetailPage } from "@/pages/report-detail";
 import { SettingsPage } from "@/pages/settings";
 
 export const router = createBrowserRouter([
   {
     path: "/auth/callback",
     element: <AuthCallbackPage />,
   },
   {
     path: "/",
     element: <AppLayout />,
     children: [
       { index: true, element: <DashboardPage /> },
       { path: "projects", element: <ProjectsPage /> },
+      { path: "projects/:id", element: <ProjectDetailPage /> },
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
