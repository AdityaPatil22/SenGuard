98b679c feat: SSE pipeline stepper with real-time node progress
---STAT---
 frontend/src/components/pipeline-stepper.tsx | 67 ++++++++++++++++++++++++++++
 frontend/src/hooks/use-evaluations.ts        | 59 +++++++++++++++++++++---
 frontend/src/pages/evaluation-detail.tsx     | 17 ++-----
 3 files changed, 125 insertions(+), 18 deletions(-)
---DIFF---
diff --git a/frontend/src/components/pipeline-stepper.tsx b/frontend/src/components/pipeline-stepper.tsx
new file mode 100644
index 0000000..15083e6
--- /dev/null
+++ b/frontend/src/components/pipeline-stepper.tsx
@@ -0,0 +1,67 @@
+import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
+
+import { cn } from "@/lib/utils";
+
+export type NodeStatus = "pending" | "running" | "completed" | "failed";
+
+interface PipelineStepperProps {
+  nodes: Record<string, NodeStatus>;
+}
+
+const STEPS = [
+  { key: "deterministic_scan", label: "Scanning" },
+  { key: "llm_analysis", label: "AI Analysis" },
+  { key: "risk_scoring", label: "Risk Scoring" },
+  { key: "report_generation", label: "Report Generation" },
+] as const;
+
+export function PipelineStepper({ nodes }: PipelineStepperProps) {
+  return (
+    <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
+      <p className="text-sm font-medium">Pipeline Progress</p>
+      <div className="flex items-center justify-between gap-2">
+        {STEPS.map((step, idx) => {
+          const status = nodes[step.key] || "pending";
+          const isLast = idx === STEPS.length - 1;
+
+          return (
+            <div key={step.key} className="flex items-center gap-2 flex-1">
+              <div className="flex flex-col items-center gap-1.5 flex-1">
+                <div className={cn(
+                  "flex h-8 w-8 items-center justify-center rounded-full border-2",
+                  status === "pending" && "border-muted bg-muted/50",
+                  status === "running" && "border-warning bg-warning/10",
+                  status === "completed" && "border-success bg-success/10",
+                  status === "failed" && "border-destructive bg-destructive/10"
+                )}>
+                  {status === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
+                  {status === "running" && <Loader2 className="h-4 w-4 text-warning animate-spin" />}
+                  {status === "completed" && <CheckCircle2 className="h-4 w-4 text-success" />}
+                  {status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
+                </div>
+                <span className={cn(
+                  "text-xs font-medium text-center",
+                  status === "pending" && "text-muted-foreground",
+                  status === "running" && "text-warning",
+                  status === "completed" && "text-success",
+                  status === "failed" && "text-destructive"
+                )}>
+                  {step.label}
+                </span>
+              </div>
+              {!isLast && (
+                <div className={cn(
+                  "h-0.5 flex-1 -mt-6",
+                  status === "completed" ? "bg-success" : "bg-muted"
+                )} />
+              )}
+            </div>
+          );
+        })}
+      </div>
+      <p className="text-xs text-muted-foreground text-center">
+        This typically takes 1-3 minutes. This page updates automatically.
+      </p>
+    </div>
+  );
+}
diff --git a/frontend/src/hooks/use-evaluations.ts b/frontend/src/hooks/use-evaluations.ts
index 9f358e3..fbde36b 100644
--- a/frontend/src/hooks/use-evaluations.ts
+++ b/frontend/src/hooks/use-evaluations.ts
@@ -1,30 +1,79 @@
 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
+import { useEffect, useRef, useState, useCallback } from "react";
 
 import { getEvaluations, createEvaluation, runEvaluation } from "@/services/evaluations";
 import type { CreateEvaluationRequest } from "@/types/api";
+import type { NodeStatus } from "@/components/pipeline-stepper";
 
 export function useEvaluations() {
   return useQuery({
     queryKey: ["evaluations"],
     queryFn: getEvaluations,
   });
 }
 
 export function useCreateEvaluation() {
   const qc = useQueryClient();
   return useMutation({
     mutationFn: (body: CreateEvaluationRequest) => createEvaluation(body),
     onSuccess: () => qc.invalidateQueries({ queryKey: ["evaluations"] }),
   });
 }
 
 export function useRunEvaluation() {
-  const qc = useQueryClient();
   return useMutation({
     mutationFn: (id: string) => runEvaluation(id),
-    onSuccess: () => {
-      qc.invalidateQueries({ queryKey: ["evaluations"] });
-      qc.invalidateQueries({ queryKey: ["reports"] });
-    },
   });
 }
+
+export function useEvaluationStream(evaluationId: string | undefined, enabled: boolean) {
+  const [nodes, setNodes] = useState<Record<string, NodeStatus>>({});
+  const [isDone, setIsDone] = useState(false);
+  const qc = useQueryClient();
+  const esRef = useRef<EventSource | null>(null);
+
+  const invalidateQueries = useCallback(() => {
+    qc.invalidateQueries({ queryKey: ["evaluations"] });
+    qc.invalidateQueries({ queryKey: ["reports"] });
+  }, [qc]);
+
+  useEffect(() => {
+    if (!enabled || !evaluationId || isDone) return;
+
+    const token = localStorage.getItem("access_token");
+    if (!token) return;
+
+    const baseUrl = import.meta.env.VITE_API_URL || "/api/v1";
+    const url = `${baseUrl}/evaluations/${evaluationId}/stream?token=${token}`;
+
+    const es = new EventSource(url);
+    esRef.current = es;
+
+    es.onmessage = (e) => {
+      const event = JSON.parse(e.data);
+
+      if (event.type === "node:start") {
+        setNodes((prev) => ({ ...prev, [event.node]: "running" }));
+      } else if (event.type === "node:complete") {
+        setNodes((prev) => ({ ...prev, [event.node]: "completed" }));
+      } else if (event.type === "node:failed") {
+        setNodes((prev) => ({ ...prev, [event.node]: "failed" }));
+      } else if (event.type === "evaluation:complete" || event.type === "evaluation:failed") {
+        setIsDone(true);
+        invalidateQueries();
+        es.close();
+      }
+    };
+
+    es.onerror = () => {
+      invalidateQueries();
+      es.close();
+    };
+
+    return () => {
+      es.close();
+    };
+  }, [evaluationId, enabled, isDone, invalidateQueries]);
+
+  return { nodes, isDone };
+}
diff --git a/frontend/src/pages/evaluation-detail.tsx b/frontend/src/pages/evaluation-detail.tsx
index b7a4960..1ef308a 100644
--- a/frontend/src/pages/evaluation-detail.tsx
+++ b/frontend/src/pages/evaluation-detail.tsx
@@ -23,21 +23,22 @@ import {
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
-import { useEvaluations } from "@/hooks/use-evaluations";
+import { PipelineStepper } from "@/components/pipeline-stepper";
+import { useEvaluations, useEvaluationStream } from "@/hooks/use-evaluations";
 import { useProjects } from "@/hooks/use-projects";
 import type { EvaluationStatus } from "@/types/api";
 import { riskColor, riskLabel } from "@/lib/utils";
 
 // ---------------------------------------------------------------------------
 // Shared constants
 // ---------------------------------------------------------------------------
 
 const STATUS_CONFIG: Record<
   EvaluationStatus,
@@ -304,20 +305,21 @@ export function EvaluationDetailPage() {
       ? projects.find((p) => p.id === evaluation.project_id)?.name ?? "Unknown Project"
       : evaluation.evaluation_type === "dataset"
         ? "Dataset Evaluation"
         : "Standalone Evaluation"
     : "";
 
   const status = (evaluation?.status.toLowerCase() ?? "pending") as EvaluationStatus;
   const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
   const StatusIcon = config.icon;
   const isRunning = status === "running";
+  const { nodes } = useEvaluationStream(evaluation?.id, isRunning);
 
   const nodeResults = evaluation?.node_results as Record<string, unknown> | null;
   const scanners = nodeResults?.scanners as Record<string, unknown> | undefined;
   const llmAnalysis = nodeResults?.llm_analysis as Record<string, unknown> | undefined;
 
   // Loading state
   if (isLoading) {
     return (
       <div className="space-y-6">
         <Skeleton className="h-5 w-48" />
@@ -394,32 +396,21 @@ export function EvaluationDetailPage() {
         <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
           <p className="text-sm font-medium text-warning mb-1">Completed with errors</p>
           <p className="text-sm text-foreground whitespace-pre-wrap">{evaluation.error_message}</p>
           <p className="text-xs text-muted-foreground mt-2">
             The risk score shown is based on deterministic scanners only. AI analysis was unavailable.
           </p>
         </div>
       )}
 
       {/* Pipeline stepper */}
-      {isRunning && (
-        <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
-          <div className="flex items-center gap-2">
-            <Loader2 className="h-4 w-4 text-warning animate-spin" />
-            <p className="text-sm font-medium">Pipeline running&hellip;</p>
-          </div>
-          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
-            <div className="h-full w-1/3 rounded-full bg-warning animate-pulse" />
-          </div>
-          <p className="text-xs text-muted-foreground text-center">This typically takes 1-3 minutes. This page updates automatically.</p>
-        </div>
-      )}
+      {isRunning && <PipelineStepper nodes={nodes} />}
 
       {/* Tabbed content */}
       <Tabs defaultValue="findings">
         <TabsList>
           <TabsTrigger value="findings">Findings</TabsTrigger>
           <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
           <TabsTrigger value="report">Report</TabsTrigger>
         </TabsList>
 
         <TabsContent value="findings">
