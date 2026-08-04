import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  CheckCircle2,
  FileText,
  Gauge,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineStepper } from "@/components/ui/pipeline-stepper";
import { useEvaluations } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import type { EvaluationStatus } from "@/types/api";
import { riskColor, riskLabel } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  EvaluationStatus,
  { variant: "default" | "secondary" | "destructive" | "success" | "warning"; icon: typeof Clock; label: string }
> = {
  pending: { variant: "secondary", icon: Clock, label: "Pending" },
  running: { variant: "warning", icon: Loader2, label: "Running" },
  completed: { variant: "success", icon: CheckCircle2, label: "Completed" },
  failed: { variant: "destructive", icon: XCircle, label: "Failed" },
};

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

const PIPELINE_STEPS = [
  { label: "Scanning", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { label: "AI Analysis", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { label: "Risk Score", icon: <Gauge className="h-3.5 w-3.5" /> },
  { label: "Report", icon: <FileText className="h-3.5 w-3.5" /> },
];

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

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
        <span className="text-muted-foreground">&middot;</span>
        <span className="text-muted-foreground">{f.recommendation}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings tab
// ---------------------------------------------------------------------------

function FindingsTab({ scanners }: { scanners: Record<string, unknown> }) {
  const findings = (scanners.findings || []) as ScannerFinding[];
  const summary = scanners.summary as Record<string, number> | undefined;
  const scannersUsed = (scanners.scanners_used || []) as string[];

  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (activeFilters.size === 0) return findings;
    return findings.filter((f) => activeFilters.has(f.severity));
  }, [findings, activeFilters]);

  const grouped = useMemo(() => {
    const map: Record<string, ScannerFinding[]> = {};
    for (const f of filtered) {
      const key = f.source || "unknown";
      (map[key] ??= []).push(f);
    }
    return map;
  }, [filtered]);

  function toggleFilter(sev: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {SEVERITY_ORDER.map((sev) => {
          const count = summary?.[sev] ?? findings.filter((f) => f.severity === sev).length;
          if (count === 0) return null;
          const active = activeFilters.has(sev);
          return (
            <Button
              key={sev}
              variant={active ? "default" : "outline"}
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => toggleFilter(sev)}
            >
              <Badge variant={SEVERITY_BADGE[sev]} className="text-[10px] uppercase">
                {count}
              </Badge>
              {sev}
            </Button>
          );
        })}
        {activeFilters.size > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setActiveFilters(new Set())}>
            Clear
          </Button>
        )}
        {scannersUsed.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            Scanned by: {scannersUsed.join(", ")}
          </span>
        )}
      </div>

      {/* Count summary */}
      {summary && (
        <p className="text-xs text-muted-foreground">
          {SEVERITY_ORDER.map((s) => (summary[s] ?? 0) > 0 ? `${summary[s]} ${s}` : null)
            .filter(Boolean)
            .join(", ")}
        </p>
      )}

      {/* Grouped by scanner */}
      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No findings match the current filters.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([source, items]) => (
            <Collapsible key={source} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 hover:text-foreground text-sm font-medium text-foreground/80">
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-panel-open]_&]:rotate-0 [[data-panel-closed]_&]:-rotate-90" />
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>{source} ({items.length} finding{items.length !== 1 ? "s" : ""})</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 pt-2 pl-6">
                  {items.map((f, i) => (
                    <FindingRow key={i} f={f} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Analysis tab
// ---------------------------------------------------------------------------

function AnalysisTab({ data }: { data: Record<string, unknown> }) {
  const summary = data.summary as string | undefined;
  const supplementary = (data.supplementary_findings || []) as Array<{
    severity: string;
    category: string;
    description: string;
    recommendation: string;
    reasoning: string;
  }>;

  return (
    <div className="space-y-4">
      {summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{summary}</p>
          </CardContent>
        </Card>
      )}

      {supplementary.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Supplementary Findings (AI-assessed)</h4>
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

      {!summary && supplementary.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No AI analysis available.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EvaluationDetailPage() {
  const { id } = useParams();
  const { data: evaluations = [], isLoading } = useEvaluations();
  const { data: projects = [] } = useProjects();

  const evaluation = evaluations.find((e) => e.id === id);
  const projectName = evaluation
    ? evaluation.project_id
      ? projects.find((p) => p.id === evaluation.project_id)?.name ?? "Unknown Project"
      : "Standalone Evaluation"
    : "";

  const status = (evaluation?.status.toLowerCase() ?? "pending") as EvaluationStatus;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const isRunning = status === "running";
  const pipelineStep = useSimulatedStep(isRunning);

  const nodeResults = evaluation?.node_results as Record<string, unknown> | null;
  const scanners = nodeResults?.scanners as Record<string, unknown> | undefined;
  const llmAnalysis = nodeResults?.llm_analysis as Record<string, unknown> | undefined;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Not found
  if (!evaluation) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold mb-2">Evaluation not found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The evaluation you're looking for doesn't exist or has been removed.
        </p>
        <Button variant="outline" size="sm" render={<Link to="/evaluations" />}>
          Back to Evaluations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/evaluations" />}>Evaluations</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{projectName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Status header */}
      <div className="flex items-center gap-4 flex-wrap">
        {evaluation.risk_score != null && (
          <div className="flex items-center gap-3">
            <span className={`text-4xl font-bold font-mono ${riskColor(evaluation.risk_score)}`}>
              {evaluation.risk_score.toFixed(0)}
            </span>
            <div>
              <p className={`text-sm font-semibold ${riskColor(evaluation.risk_score)}`}>
                {riskLabel(evaluation.risk_score)}
              </p>
            </div>
          </div>
        )}
        <Badge variant={isRunning ? "warning" : config.variant} className="gap-1">
          <StatusIcon className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`} />
          {isRunning ? "Running" : config.label}
        </Badge>
        <Separator orientation="vertical" className="h-5 hidden sm:block" />
        <span className="text-sm text-muted-foreground">{evaluation.model_name || "Default model"}</span>
        <span className="text-sm text-muted-foreground">{formatDate(evaluation.created_at)}</span>
      </div>

      {/* Error banner */}
      {status === "failed" && evaluation.error_message && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive mb-1">Error</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{evaluation.error_message}</p>
        </div>
      )}

      {/* Partial failure warning */}
      {status === "completed" && evaluation.error_message && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning mb-1">Completed with errors</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{evaluation.error_message}</p>
          <p className="text-xs text-muted-foreground mt-2">
            The risk score shown is based on deterministic scanners only. AI analysis was unavailable.
          </p>
        </div>
      )}

      {/* Pipeline stepper */}
      {isRunning && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-warning animate-spin" />
            <p className="text-sm font-medium">Pipeline running&hellip;</p>
          </div>
          <PipelineStepper steps={PIPELINE_STEPS} currentStep={pipelineStep} />
          <p className="text-xs text-muted-foreground text-center">This typically takes 1-3 minutes</p>
        </div>
      )}

      {/* Tabbed content */}
      <Tabs defaultValue="findings">
        <TabsList>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>

        <TabsContent value="findings">
          {scanners ? (
            <FindingsTab scanners={scanners} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No scanner results available yet.</p>
          )}
        </TabsContent>

        <TabsContent value="analysis">
          {llmAnalysis ? (
            <AnalysisTab data={llmAnalysis} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No AI analysis available yet.</p>
          )}
        </TabsContent>

        <TabsContent value="report">
          {evaluation.summary ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{evaluation.summary}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No report generated yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
