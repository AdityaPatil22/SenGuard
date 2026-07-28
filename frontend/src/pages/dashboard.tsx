import { ArrowRight, FileText, FlaskConical, FolderKanban, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvaluations } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import { useReports } from "@/hooks/use-reports";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  submitted: "default",
  evaluating: "warning",
  evaluated: "default",
  approved: "success",
  rejected: "destructive",
  pending: "secondary",
  running: "warning",
  completed: "success",
  failed: "destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function riskColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score < 0.3) return "text-success";
  if (score < 0.6) return "text-warning";
  return "text-destructive";
}

export function DashboardPage() {
  const { data: projects = [] } = useProjects();
  const { data: evaluations = [] } = useEvaluations();
  const { data: reports = [] } = useReports();

  const scoredEvals = evaluations.filter((e) => e.risk_score != null);
  const avgRisk =
    scoredEvals.length > 0
      ? scoredEvals.reduce((sum, e) => sum + (e.risk_score ?? 0), 0) / scoredEvals.length
      : 0;

  const stats = [
    { label: "Projects", value: projects.length, icon: FolderKanban, href: "/projects" },
    { label: "Evaluations", value: evaluations.length, icon: FlaskConical, href: "/evaluations" },
    { label: "Reports", value: reports.length, icon: FileText, href: "/reports" },
    { label: "Avg Risk", value: avgRisk.toFixed(2), icon: ShieldAlert, href: "/evaluations" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your AI governance overview at a glance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.href} className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{s.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Projects</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
              <Link to="/projects">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet. Import a GitHub repository to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.created_at)}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>{p.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Evaluations</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
              <Link to="/evaluations">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {evaluations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No evaluations yet. Create one from the Evaluations page.
              </p>
            ) : (
              <div className="space-y-3">
                {evaluations.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{e.model_name ?? "Default model"}</p>
                      <p className="text-xs text-muted-foreground">
                        Risk:{" "}
                        <span className={riskColor(e.risk_score)}>
                          {e.risk_score != null ? e.risk_score.toFixed(2) : "—"}
                        </span>
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[e.status] ?? "secondary"}>{e.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
