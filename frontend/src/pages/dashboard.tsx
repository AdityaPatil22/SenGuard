import {
  AlertTriangle,
  ArrowRight,
  FileText,
  FlaskConical,
  FolderKanban,
  ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Counter } from "@/components/ui/counter";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { useDatasets } from "@/hooks/use-datasets";
import { useEvaluations } from "@/hooks/use-evaluations";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { useProjects } from "@/hooks/use-projects";
import { useReports } from "@/hooks/use-reports";
import { useSkills } from "@/hooks/use-skills";
import { riskColor, riskLabel } from "@/lib/utils";

import type { Evaluation, Report } from "@/types/api";

const EVAL_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  pending: "secondary",
  running: "warning",
  completed: "success",
  failed: "destructive",
};

const REPORT_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  in_review: "warning",
  approved: "success",
  rejected: "destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DashboardPage() {
  const { data: projects = [] } = useProjects();
  const { data: datasets = [] } = useDatasets();
  const { data: mcpServers = [] } = useMcpServers();
  const { data: skills = [] } = useSkills();
  const { data: evaluations = [] } = useEvaluations();
  const { data: reports = [] } = useReports();

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const datasetMap = useMemo(() => new Map(datasets.map((d) => [d.id, d.name])), [datasets]);
  const mcpServerMap = useMemo(() => new Map(mcpServers.map((s) => [s.id, s.name])), [mcpServers]);
  const skillMap = useMemo(() => new Map(skills.map((s) => [s.id, s.name])), [skills]);

  function subjectName(e: Evaluation): string {
    if (e.project_id) return projectMap.get(e.project_id) ?? "Unknown Project";
    if (e.dataset_id) return datasetMap.get(e.dataset_id) ?? "Dataset Evaluation";
    if (e.mcp_server_id) return mcpServerMap.get(e.mcp_server_id) ?? "MCP Server";
    if (e.skill_id) return skillMap.get(e.skill_id) ?? "AI Skill";
    return "Standalone Evaluation";
  }

  const scoredEvals = evaluations.filter((e) => e.risk_score != null);
  const avgRisk =
    scoredEvals.length > 0
      ? scoredEvals.reduce((sum, e) => sum + (e.risk_score ?? 0), 0) / scoredEvals.length
      : 0;

  const stats = [
    { label: "Projects", value: projects.length, icon: FolderKanban, href: "/projects", decimals: 0 },
    { label: "Evaluations", value: evaluations.length, icon: FlaskConical, href: "/evaluations", decimals: 0 },
    { label: "Reports", value: reports.length, icon: FileText, href: "/reports", decimals: 0 },
    { label: "Avg Risk", value: parseFloat(avgRisk.toFixed(2)), icon: ShieldAlert, href: "/evaluations", decimals: 2 },
  ];

  // Action-oriented data
  const needsAttention: Evaluation[] = evaluations.filter(
    (e) => e.status === "running" || e.status === "failed"
  );

  const needsReview: Report[] = reports.filter(
    (r) => r.status === "in_review"
  );

  const recentFindings: Evaluation[] = evaluations
    .filter((e) => e.status === "completed" && e.risk_score != null)
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your AI governance overview at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.href} className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  <Counter
                    value={s.value}
                    fontSize={24}
                    fontWeight={600}
                    decimals={s.decimals}
                  />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Action-oriented sections */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active Evaluations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Active Evaluations</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" render={<Link to="/evaluations" />}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {needsAttention.length === 0 ? (
              <Empty className="py-4">
                <EmptyMedia variant="icon"><FlaskConical /></EmptyMedia>
                <EmptyTitle>All clear</EmptyTitle>
                <EmptyDescription>No running or failed evaluations.</EmptyDescription>
              </Empty>
            ) : (
              <div className="space-y-3">
                {needsAttention.map((e) => (
                  <Link key={e.id} to={`/evaluations/${e.id}`} className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{subjectName(e)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.created_at)}</p>
                    </div>
                    <Badge variant={EVAL_STATUS_VARIANT[e.status] ?? "secondary"}>{e.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Needs Review */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Needs Review</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" render={<Link to="/reports" />}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {needsReview.length === 0 ? (
              <Empty className="py-4">
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>No pending reviews</EmptyTitle>
                <EmptyDescription>All reports are up to date.</EmptyDescription>
              </Empty>
            ) : (
              <div className="space-y-3">
                {needsReview.map((r) => (
                  <Link key={r.id} to={`/reports/${r.id}`} className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.subject_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Risk:{" "}
                        <span className={riskColor(r.risk_score)}>
                          {r.risk_score != null ? riskLabel(r.risk_score) : "N/A"}
                        </span>
                      </p>
                    </div>
                    <Badge variant={REPORT_STATUS_VARIANT[r.status] ?? "secondary"}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Findings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Findings</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" render={<Link to="/evaluations" />}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentFindings.length === 0 ? (
              <Empty className="py-4">
                <EmptyMedia variant="icon"><AlertTriangle /></EmptyMedia>
                <EmptyTitle>No findings yet</EmptyTitle>
                <EmptyDescription>Completed evaluations will appear here.</EmptyDescription>
              </Empty>
            ) : (
              <div className="space-y-3">
                {recentFindings.map((e) => (
                  <Link key={e.id} to={`/evaluations/${e.id}`} className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{subjectName(e)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.created_at)}</p>
                    </div>
                    <span className={`text-xs font-medium ${riskColor(e.risk_score)}`}>
                      {e.risk_score != null ? `${Math.round(e.risk_score)}/100` : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
