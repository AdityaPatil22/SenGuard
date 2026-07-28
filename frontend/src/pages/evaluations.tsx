import { Play, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEvaluations, useCreateEvaluation, useRunEvaluation } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import type { EvaluationStatus } from "@/types/api";

const STATUS_VARIANT: Record<EvaluationStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  pending: "secondary",
  running: "warning",
  completed: "success",
  failed: "destructive",
};

function riskColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score < 0.3) return "text-success";
  if (score < 0.6) return "text-warning";
  return "text-destructive";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  function handleRun(id: string) {
    setRunningId(id);
    runEvaluation.mutate(id, { onSettled: () => setRunningId(null) });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluations</h1>
          <p className="text-sm text-muted-foreground">Governance evaluation results and risk scores</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Evaluation
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ) : evaluations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No evaluations yet</p>
            <Button variant="link" size="sm" onClick={() => setDialogOpen(true)}>
              Create your first evaluation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead className="hidden md:table-cell">Summary</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluations.map((e) => {
                const status = e.status.toLowerCase() as EvaluationStatus;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium font-mono text-xs">
                      {e.model_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>{status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`font-mono text-sm font-medium ${riskColor(e.risk_score)}`}>
                        {e.risk_score != null ? e.risk_score.toFixed(2) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                      {status === "failed" && e.error_message
                        ? e.error_message
                        : e.summary ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {formatDate(e.created_at)}
                    </TableCell>
                    <TableCell>
                      {status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          disabled={runningId === e.id}
                          onClick={() => handleRun(e.id)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          {runningId === e.id ? "Running..." : "Run"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Evaluation</DialogTitle>
            <DialogDescription>Run a governance evaluation on a project.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="eval-project">Project</Label>
              <Select
                id="eval-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                <option value="" disabled>Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eval-model">Model name</Label>
              <Input
                id="eval-model"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gemini-2.5-flash"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEvaluation.isPending}>
                {createEvaluation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
