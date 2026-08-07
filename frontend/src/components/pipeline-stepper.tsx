import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type NodeStatus = "pending" | "running" | "completed" | "failed";

interface PipelineStepperProps {
  nodes: Record<string, NodeStatus>;
}

const STEPS = [
  { key: "deterministic_scan", label: "Scanning" },
  { key: "llm_analysis", label: "AI Analysis" },
  { key: "risk_scoring", label: "Risk Scoring" },
  { key: "report_generation", label: "Report Generation" },
] as const;

export function PipelineStepper({ nodes }: PipelineStepperProps) {
  return (
    <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
      <p className="text-sm font-medium">Pipeline Progress</p>
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((step, idx) => {
          const status = nodes[step.key] || "pending";
          const isLast = idx === STEPS.length - 1;

          return (
            <div key={step.key} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2",
                  status === "pending" && "border-muted bg-muted/50",
                  status === "running" && "border-warning bg-warning/10",
                  status === "completed" && "border-success bg-success/10",
                  status === "failed" && "border-destructive bg-destructive/10"
                )}>
                  {status === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
                  {status === "running" && <Loader2 className="h-4 w-4 text-warning animate-spin" />}
                  {status === "completed" && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
                <span className={cn(
                  "text-s font-medium text-center",
                  status === "pending" && "text-muted-foreground",
                  status === "running" && "text-warning",
                  status === "completed" && "text-success",
                  status === "failed" && "text-destructive"
                )}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div className={cn(
                  "h-0.5 flex-1 -mt-6",
                  status === "completed" ? "bg-success" : "bg-muted"
                )} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        This typically takes 1-3 minutes. This page updates automatically.
      </p>
    </div>
  );
}
