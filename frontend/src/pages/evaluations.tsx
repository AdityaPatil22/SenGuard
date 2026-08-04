import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Gauge,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineStepper } from "@/components/ui/pipeline-stepper";
import { useEvaluations, useCreateEvaluation, useRunEvaluation } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import type { Evaluation, EvaluationStatus } from "@/types/api";
import { riskColor, riskLabel, renderMarkdown } from "@/lib/utils";

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

const SEVERITY_BADGE: Record<string, "destructive" | "warning" | "secondary" | "default"> = {
  critical: "destructive",
  high: "warning",
  medium: "secondary",
  low: "default",
};

const CONFIDENCE_STYLE: Record<string, { label: string; class: string }> = {
  verified: { label: "Verified", class: "bg-success/10 text-success border-success/30" },
  observed: { label: "Observed", class: "bg-warning/10 text-warning border-warning/30" },
  "potential-risk": { label: "Potential Risk", class: "bg-muted text-muted-foreground border-border" },
};

interface ScannerFinding {
  source: string;
  severity: string;
  category: string;
  description: string;
  recommendation: string;
  confidence?: string;
  file?: string;
  line?: number;
  evidence?: string;
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const style = CONFIDENCE_STYLE[confidence ?? "observed"] ?? CONFIDENCE_STYLE["observed"];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${style!.class}`}>
      {style!.label}
    </span>
  );
}

function FindingRow({ f }: { f: ScannerFinding }) {
  return (
    <div className="rounded-md border p-3 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={SEVERITY_BADGE[f.severity] || "default"} className="text-[10px] uppercase">
          {f.severity}
        </Badge>
        <ConfidenceBadge confidence={f.confidence} />
        <span className="text-xs font-medium text-foreground">{f.description}</span>
      </div>
      {f.file && (
        <p className="text-xs text-muted-foreground font-mono">
          {f.file}{f.line != null ? `:${f.line}` : ""}
        </p>
      )}
      {f.evidence && (
        <pre className="text-[11px] bg-muted p-2 rounded overflow-x-auto font-mono">{f.evidence}</pre>
      )}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Source: {f.source}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{f.recommendation}</span>
      </div>
    </div>
  );
}

function ScannerResultsCard({ data }: { data: Record<string, unknown> }) {
  const findings = (data.findings || []) as ScannerFinding[];
  const summary = data.summary as Record<string, number> | undefined;
  const scannersUsed = (data.scanners_used || []) as string[];

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Scanner Findings</h4>
      </div>
      {summary && (
        <div className="flex gap-3 text-xs">
          {(summary.critical ?? 0) > 0 && <Badge variant="destructive">{summary.critical} critical</Badge>}
          {(summary.high ?? 0) > 0 && <Badge variant="warning">{summary.high} high</Badge>}
          {(summary.medium ?? 0) > 0 && <Badge variant="secondary">{summary.medium} medium</Badge>}
          {(summary.low ?? 0) > 0 && <Badge variant="default">{summary.low} low</Badge>}
          <span className="text-muted-foreground ml-auto">Scanned by: {scannersUsed.join(", ")}</span>
        </div>
      )}
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings detected.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {findings.map((f, i) => <FindingRow key={i} f={f} />)}
        </div>
      )}
    </div>
  );
}

function RiskBreakdownCard({ data }: { data: Record<string, unknown> }) {
  const base = data.base_score as number | undefined;
  const adj = data.adjustment as number | undefined;
  const final_ = data.adjusted_score as number | undefined;
  const reason = data.adjustment_reason as string | undefined;
  const level = data.risk_level as string | undefined;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Risk Breakdown</h4>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Base Score</p>
          <p className="text-xl font-bold font-mono">{base ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Adjustment</p>
          <p className="text-xl font-bold font-mono">{adj != null ? `${adj >= 0 ? "+" : ""}${adj}` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Final</p>
          <p className={`text-xl font-bold font-mono ${riskColor(final_ ?? null)}`}>{final_ ?? "—"}</p>
        </div>
      </div>
      {level && <Badge variant={SEVERITY_BADGE[level] || "secondary"} className="uppercase">{level} risk</Badge>}
      {reason && <p className="text-xs text-muted-foreground italic">{reason}</p>}
    </div>
  );
}

function LlmAnalysisCard({ data }: { data: Record<string, unknown> }) {
  const supplementary = (data.supplementary_findings || []) as Array<{
    severity: string;
    category: string;
    description: string;
    recommendation: string;
    reasoning: string;
  }>;
  const summary = data.summary as string | undefined;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">AI Analysis</h4>
      </div>
      {summary && <p className="text-sm text-foreground">{summary}</p>}
      {supplementary.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Supplementary Findings (AI-assessed)</p>
          {supplementary.map((f, i) => (
            <div key={i} className="rounded-md border border-dashed p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={SEVERITY_BADGE[f.severity] || "default"} className="text-[10px] uppercase">
                  {f.severity}
                </Badge>
                <ConfidenceBadge confidence="potential-risk" />
                <span className="text-xs font-medium">{f.description}</span>
              </div>
              <p className="text-[11px] text-muted-foreground italic">{f.reasoning}</p>
              <p className="text-[11px] text-muted-foreground">{f.recommendation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeResults({ nodeResults }: { nodeResults: Record<string, unknown> }) {
  const scanners = nodeResults.scanners as Record<string, unknown> | undefined;
  const llmAnalysis = nodeResults.llm_analysis as Record<string, unknown> | undefined;
  const riskBreakdown = nodeResults.risk_breakdown as Record<string, unknown> | undefined;

  return (
    <div className="space-y-3">
      {scanners && <ScannerResultsCard data={scanners} />}
      {llmAnalysis && <LlmAnalysisCard data={llmAnalysis} />}
      {riskBreakdown && <RiskBreakdownCard data={riskBreakdown} />}
    </div>
  );
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

function EvaluationDetail({ evaluation, onClose }: { evaluation: Evaluation; onClose: () => void }) {
  const status = evaluation.status.toLowerCase() as EvaluationStatus;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const nodeResults = evaluation.node_results as Record<string, unknown> | null;
  const pipelineStep = useSimulatedStep(status === "running");

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Evaluation Results
            <Badge variant={config.variant} className="ml-2 gap-1">
              <StatusIcon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
              {config.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {evaluation.model_name ? `Model: ${evaluation.model_name}` : "Default model"} &middot;{" "}
            {formatDate(evaluation.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {evaluation.risk_score != null && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Risk Score</p>
                <p className={`text-3xl font-bold font-mono ${riskColor(evaluation.risk_score)}`}>
                  {evaluation.risk_score.toFixed(0)}
                </p>
              </div>
              <div>
                <p className={`text-sm font-semibold ${riskColor(evaluation.risk_score)}`}>
                  {riskLabel(evaluation.risk_score)}
                </p>
              </div>
            </div>
          )}

          {status === "failed" && evaluation.error_message && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive mb-1">Error</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{evaluation.error_message}</p>
            </div>
          )}

          {status === "running" && (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-warning animate-spin" />
                <p className="text-sm font-medium">Pipeline running&hellip;</p>
              </div>
              <PipelineStepper steps={PIPELINE_STEPS} currentStep={pipelineStep} />
              <p className="text-xs text-muted-foreground text-center">
                This typically takes 1-3 minutes
              </p>
            </div>
          )}

          {nodeResults && Object.keys(nodeResults).length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">Pipeline Results</h3>
                <NodeResults nodeResults={nodeResults} />
              </div>
            </>
          )}

          {evaluation.summary && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-2">Governance Report</h3>
                <div
                  className="text-sm text-foreground bg-muted/30 p-4 rounded-lg prose-sm max-h-[60vh] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(evaluation.summary) }}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EvaluationsPage() {
  const { data: evaluations = [], isLoading } = useEvaluations();
  const { data: projects = [] } = useProjects();
  const createEvaluation = useCreateEvaluation();
  const runEvaluation = useRunEvaluation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [modelName, setModelName] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [detailEval, setDetailEval] = useState<Evaluation | null>(null);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createEvaluation.mutate(
      { project_id: projectId, model_name: modelName || undefined },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setProjectId("");
          setModelName("");
        },
      },
    );
  }

  function handleRun(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRunningId(id);
    runEvaluation.mutate(id, { onSettled: () => setRunningId(null) });
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
        <div className="space-y-2">
          {evaluations.map((e) => {
            const isRunning = runningId === e.id || e.status.toLowerCase() === "running";

            return (
              <EvaluationCard
                key={e.id}
                evaluation={e}
                projectName={projectMap[e.project_id] || "Unknown Project"}
                isRunning={isRunning}
                onRun={(ev) => handleRun(e.id, ev)}
                onClick={() => setDetailEval(e)}
              />
            );
          })}
        </div>
      )}

      {detailEval && <EvaluationDetail evaluation={detailEval} onClose={() => setDetailEval(null)} />}

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
              <Label htmlFor="eval-project">Project</Label>
              <Select id="eval-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                <option value="" disabled>
                  Choose a project to evaluate
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
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
