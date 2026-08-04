import {
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineStepper } from "@/components/ui/pipeline-stepper";
import { useEvaluations, useCreateEvaluation, useRunEvaluation } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import type { Evaluation, EvaluationStatus } from "@/types/api";
import { riskColor, riskLabel } from "@/lib/utils";

import {
  AlertTriangle,
  FileText,
  Gauge,
  ShieldCheck,
} from "lucide-react";

const STATUS_CONFIG: Record<
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

const PIPELINE_STEPS = [
  { label: "Scanning", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { label: "AI Analysis", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { label: "Risk Score", icon: <Gauge className="h-3.5 w-3.5" /> },
  { label: "Report", icon: <FileText className="h-3.5 w-3.5" /> },
];

function useSimulatedStep(isRunning: boolean) {
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (!isRunning) {
      setStep(1);
      return;
    }
    const interval = setInterval(() => {
      setStep((s) => (s < PIPELINE_STEPS.length ? s + 1 : s));
    }, 8000);
    return () => clearInterval(interval);
  }, [isRunning]);
  return step;
}

function EvaluationCard({
  evaluation: e,
  projectName,
  isRunning,
  onRun,
  onClick,
}: {
  evaluation: Evaluation;
  projectName: string;
  isRunning: boolean;
  onRun: (ev: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const status = e.status.toLowerCase() as EvaluationStatus;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const pipelineStep = useSimulatedStep(isRunning);

  return (
    <Card className="transition-colors hover:bg-muted/30 cursor-pointer" onClick={onClick}>
      <CardContent className="p-4 space-y-3">
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
              <p className="text-sm font-medium truncate">{projectName}</p>
              <Badge variant={isRunning ? "warning" : config.variant} className="shrink-0">
                {isRunning ? "Running" : config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {e.model_name || "Default model"} &middot; {formatDate(e.created_at)}
              {status === "failed" && e.error_message && (
                <span className="text-destructive"> &middot; {e.error_message.slice(0, 80)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {e.risk_score != null && (
              <div className="text-right hidden sm:block">
                <p className={`text-lg font-bold font-mono ${riskColor(e.risk_score)}`}>{e.risk_score.toFixed(0)}</p>
                <p className={`text-[10px] font-medium ${riskColor(e.risk_score)}`}>{riskLabel(e.risk_score)}</p>
              </div>
            )}
            {status === "pending" && !isRunning && (
              <Button variant="default" size="sm" className="gap-1.5" onClick={onRun}>
                <Play className="h-3.5 w-3.5" />
                Run
              </Button>
            )}
          </div>
        </div>
        {isRunning && <PipelineStepper steps={PIPELINE_STEPS} currentStep={pipelineStep} />}
      </CardContent>
    </Card>
  );
}

export function EvaluationsPage() {
  const { data: evaluations = [], isLoading } = useEvaluations();
  const { data: projects = [] } = useProjects();
  const createEvaluation = useCreateEvaluation();
  const runEvaluation = useRunEvaluation();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [modelName, setModelName] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const filtered = useMemo(() => {
    if (!search.trim()) return evaluations;
    const q = search.toLowerCase();
    return evaluations.filter((e) => {
      const name = projectMap[e.project_id]?.toLowerCase() ?? "";
      const model = e.model_name?.toLowerCase() ?? "";
      return name.includes(q) || model.includes(q);
    });
  }, [evaluations, search, projectMap]);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createEvaluation.mutate(
      { project_id: projectId, model_name: modelName || undefined },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setProjectId("");
          setModelName("");
          toast.success("Evaluation created");
        },
        onError: () => {
          toast.error("Failed to create evaluation");
        },
      },
    );
  }

  function handleRun(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRunningId(id);
    runEvaluation.mutate(id, {
      onSuccess: () => toast.success("Evaluation started"),
      onError: () => toast.error("Failed to run evaluation"),
      onSettled: () => setRunningId(null),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluations</h1>
          <p className="text-sm text-muted-foreground">
            Run governance evaluations on your projects and view risk analysis results
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Evaluation
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : evaluations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <FlaskConical className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No evaluations yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create an evaluation to run your project through the AI governance pipeline. You'll get a risk score and
              detailed analysis.
            </p>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Evaluation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by project or model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No evaluations match your search.</p>
            ) : (
              filtered.map((e) => {
                const isRunning = runningId === e.id || e.status.toLowerCase() === "running";
                return (
                  <EvaluationCard
                    key={e.id}
                    evaluation={e}
                    projectName={projectMap[e.project_id] || "Unknown Project"}
                    isRunning={isRunning}
                    onRun={(ev) => handleRun(e.id, ev)}
                    onClick={() => navigate(`/evaluations/${e.id}`)}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Evaluation</DialogTitle>
            <DialogDescription>
              Select a project to run through the AI governance pipeline. The evaluation checks for security risks,
              data quality, and model reliability.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")} required>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a project to evaluate">
                    {(value: string) => value ? projectMap[value] ?? value : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} label={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projects.length === 0 && (
                <p className="text-xs text-muted-foreground">No projects found. Create a project first.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="eval-model">Model name (optional)</Label>
              <Input
                id="eval-model"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gemini-2.5-flash"
              />
              <p className="text-xs text-muted-foreground">
                The LLM model your project uses. Helps the evaluator assess model-specific risks.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEvaluation.isPending}>
                {createEvaluation.isPending ? "Creating..." : "Create Evaluation"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
