import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, FlaskConical, Loader2, Play, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { useProjects } from "@/hooks/use-projects";
import {
  useEvaluations,
  useCreateEvaluation,
  useRunEvaluation,
  useEvaluationStream,
} from "@/hooks/use-evaluations";
import type { Evaluation, EvaluationStatus, ProjectStatus } from "@/types/api";
import { riskColor, riskLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  submitted: "default",
  evaluating: "warning",
  evaluated: "default",
  approved: "success",
  rejected: "destructive",
};

const EVAL_STATUS: Record<
  EvaluationStatus,
  { variant: "default" | "secondary" | "destructive" | "success" | "warning"; icon: typeof Clock; label: string }
> = {
  pending: { variant: "secondary", icon: Clock, label: "Pending" },
  running: { variant: "warning", icon: Loader2, label: "Running" },
  completed: { variant: "success", icon: CheckCircle2, label: "Completed" },
  failed: { variant: "destructive", icon: XCircle, label: "Failed" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const { data: evaluations = [], isLoading: loadingEvals } = useEvaluations();
  const createEvaluation = useCreateEvaluation();
  const runEvaluation = useRunEvaluation();
  const [runningEvalId, setRunningEvalId] = useState<string | null>(null);
  const { nodes, isDone } = useEvaluationStream(runningEvalId ?? undefined, !!runningEvalId);

  useEffect(() => {
    if (isDone) setRunningEvalId(null);
  }, [isDone]);

  const project = projects.find((p) => p.id === id);

  const projectEvals = useMemo(() => {
    if (!id) return [];
    return evaluations
      .filter((e) => e.project_id === id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [id, evaluations]);

  const latestCompleted = projectEvals.find((e) => e.status === "completed" && e.risk_score != null);
  const latestRiskScore = latestCompleted?.risk_score ?? null;

  function handleNewEvaluation() {
    createEvaluation.mutate(
      { project_id: id },
      {
        onSuccess: (evaluation) => {
          toast.success("Evaluation created");
          if (evaluation?.id) {
            runEvaluation.mutate(evaluation.id, {
              onSuccess: () => {
                toast.success("Evaluation started");
                setRunningEvalId(evaluation.id);
              },
              onError: () => toast.error("Failed to start evaluation"),
            });
          }
        },
        onError: () => toast.error("Failed to create evaluation"),
      },
    );
  }

  function handleRun(evalId: string) {
    runEvaluation.mutate(evalId, {
      onSuccess: () => {
        toast.success("Evaluation started");
        setRunningEvalId(evalId);
      },
      onError: () => toast.error("Failed to run evaluation"),
    });
  }

  const isLoading = loadingProjects || loadingEvals;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold mb-2">Project not found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The project you're looking for doesn't exist or has been removed.
        </p>
        <Button variant="outline" size="sm" render={<Link to="/projects" />}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/projects" />}>Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
          {latestRiskScore != null && (
            <div className="flex items-center gap-2 pl-3 border-l">
              <span className={`text-lg font-bold font-mono ${riskColor(latestRiskScore)}`}>
                {latestRiskScore.toFixed(0)}
              </span>
              <span className={`text-xs font-medium ${riskColor(latestRiskScore)}`}>
                {riskLabel(latestRiskScore)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Stepper */}
      {runningEvalId && Object.keys(nodes).length > 0 && (
        <PipelineStepper nodes={nodes} />
      )}

      {/* Evaluations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Evaluations</h2>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleNewEvaluation}
            disabled={createEvaluation.isPending || runEvaluation.isPending}
          >
            {createEvaluation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {createEvaluation.isPending ? "Creating..." : "Run Evaluation"}
          </Button>
        </div>

        {projectEvals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                <FlaskConical className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold mb-1">No evaluations yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Run an evaluation to scan this project through the AI governance pipeline and get a risk score.
              </p>
              <Button
                size="sm"
                onClick={handleNewEvaluation}
                disabled={createEvaluation.isPending}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Run First Evaluation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {projectEvals.map((e) => (
              <EvalCard
                key={e.id}
                evaluation={e}
                isRunning={runningEvalId === e.id}
                onRun={() => handleRun(e.id)}
                onClick={() => navigate(`/evaluations/${e.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvalCard({
  evaluation: e,
  isRunning,
  onRun,
  onClick,
}: {
  evaluation: Evaluation;
  isRunning: boolean;
  onRun: () => void;
  onClick: () => void;
}) {
  const status = e.status as EvaluationStatus;
  const config = EVAL_STATUS[status] || EVAL_STATUS.pending;
  const StatusIcon = config.icon;

  return (
    <Card className="transition-colors hover:bg-muted/30 cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
              isRunning
                ? "bg-warning/10"
                : status === "completed"
                  ? "bg-success/10"
                  : status === "failed"
                    ? "bg-destructive/10"
                    : "bg-muted"
            }`}
          >
            <StatusIcon
              className={`h-5 w-5 ${
                isRunning
                  ? "text-warning animate-spin"
                  : status === "completed"
                    ? "text-success"
                    : status === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground"
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{e.model_name || "Default model"}</p>
              <Badge variant={isRunning ? "warning" : config.variant} className="shrink-0">
                {isRunning ? "Running" : config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(e.created_at)}
              {status === "failed" && e.error_message && (
                <span className="text-destructive"> &middot; {e.error_message.slice(0, 80)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {e.risk_score != null && (
              <div className="text-right hidden sm:block">
                <p className={`text-lg font-bold font-mono ${riskColor(e.risk_score)}`}>
                  {e.risk_score.toFixed(0)}
                </p>
                <p className={`text-[10px] font-medium ${riskColor(e.risk_score)}`}>
                  {riskLabel(e.risk_score)}
                </p>
              </div>
            )}
            {status === "pending" && !isRunning && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onRun();
                }}
              >
                <Play className="h-3.5 w-3.5" />
                Run
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
