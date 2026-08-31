import {
  Ban,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
import { useDatasets } from "@/hooks/use-datasets";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { useSkills } from "@/hooks/use-skills";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { useEvaluations, useCreateEvaluation, useRunEvaluation, useEvaluationStream, useDeleteEvaluation, useCancelEvaluation } from "@/hooks/use-evaluations";
import { useProjects } from "@/hooks/use-projects";
import type { Evaluation, EvaluationStatus } from "@/types/api";
import { riskColor, riskLabel } from "@/lib/utils";

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

function EvaluationCard({
  evaluation: e,
  projectName,
  onRun,
  isRunPending,
  onClick,
  onDelete,
  onCancel,
}: {
  evaluation: Evaluation;
  projectName: string;
  onRun: (ev: React.MouseEvent) => void;
  isRunPending: boolean;
  onClick: () => void;
  onDelete: (ev: React.MouseEvent) => void;
  onCancel: (ev: React.MouseEvent) => void;
}) {
  const status = e.status.toLowerCase() as EvaluationStatus;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  return (
    <Card className="transition-colors hover:bg-muted/30 cursor-pointer" onClick={onClick}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-4">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
              isRunPending
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
                isRunPending
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
              <Badge variant={isRunPending ? "warning" : config.variant} className="shrink-0">
                {isRunPending ? "Running" : config.label}
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
            {status === "pending" && !isRunPending && (
              <Button variant="default" size="sm" className="gap-1.5" onClick={onRun}>
                <Play className="h-3.5 w-3.5" />
                Run
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(ev) => ev.stopPropagation()}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[180px]">
                {status === "running" && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onCancel}>
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel evaluation
                  </DropdownMenuItem>
                )}
                {status !== "running" && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete evaluation
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EvaluationsPage() {
  const { data: evaluations = [], isLoading } = useEvaluations();
  const { data: projects = [] } = useProjects();
  const { data: datasets = [] } = useDatasets();
  const { data: mcpServers = [] } = useMcpServers();
  const { data: skills = [] } = useSkills();
  const createEvaluation = useCreateEvaluation();
  const runEvaluation = useRunEvaluation();
  const removeEvaluation = useDeleteEvaluation();
  const cancelEval = useCancelEvaluation();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [evalType, setEvalType] = useState<"application" | "dataset" | "mcp_server" | "skill">("application");
  const [projectId, setProjectId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [mcpServerId, setMcpServerId] = useState("");
  const [skillId, setSkillId] = useState("");
  const [modelName, setModelName] = useState("");
  const [search, setSearch] = useState("");
  const [runningEvalId, setRunningEvalId] = useState<string | null>(null);
  const { nodes, isDone } = useEvaluationStream(runningEvalId ?? undefined, !!runningEvalId);

  useEffect(() => {
    if (isDone) setRunningEvalId(null);
  }, [isDone]);

  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const datasetMap = useMemo(() => Object.fromEntries(datasets.map((d) => [d.id, d.name])), [datasets]);
  const mcpServerMap = useMemo(() => Object.fromEntries(mcpServers.map((s) => [s.id, s.name])), [mcpServers]);
  const skillMap = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s.name])), [skills]);

  const getSubjectName = useCallback((e: Evaluation): string => {
    if (e.project_id) return projectMap[e.project_id] ?? "Unknown Project";
    if (e.dataset_id) return datasetMap[e.dataset_id] ?? "Dataset Evaluation";
    if (e.mcp_server_id) return mcpServerMap[e.mcp_server_id] ?? "MCP Server";
    if (e.skill_id) return skillMap[e.skill_id] ?? "AI Skill";
    return "Standalone Evaluation";
  }, [projectMap, datasetMap, mcpServerMap, skillMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return evaluations;
    const q = search.toLowerCase();
    return evaluations.filter((e) => {
      const name = getSubjectName(e).toLowerCase();
      const model = e.model_name?.toLowerCase() ?? "";
      return name.includes(q) || model.includes(q);
    });
  }, [evaluations, search, getSubjectName]);

  function resetDialog() {
    setEvalType("application");
    setProjectId("");
    setDatasetId("");
    setMcpServerId("");
    setSkillId("");
    setModelName("");
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createEvaluation.mutate(
      {
        project_id: evalType === "application" ? projectId || undefined : undefined,
        dataset_id: evalType === "dataset" ? datasetId || undefined : undefined,
        mcp_server_id: evalType === "mcp_server" ? mcpServerId || undefined : undefined,
        skill_id: evalType === "skill" ? skillId || undefined : undefined,
        model_name: modelName || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          resetDialog();
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
    runEvaluation.mutate(id, {
      onSuccess: () => {
        toast.success("Evaluation started");
        setRunningEvalId(id);
      },
      onError: () => toast.error("Failed to run evaluation"),
    });
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeEvaluation.mutate(id, {
      onSuccess: () => toast.success("Evaluation deleted"),
      onError: () => toast.error("Failed to delete evaluation"),
    });
  }

  function handleCancel(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    cancelEval.mutate(id, {
      onSuccess: () => {
        toast.success("Evaluation cancelled");
        if (runningEvalId === id) setRunningEvalId(null);
      },
      onError: () => toast.error("Failed to cancel evaluation"),
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
              placeholder="Search evaluations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No evaluations match your search.</p>
            ) : (
              filtered.map((e) => (
                <div key={e.id} className="space-y-2">
                  <EvaluationCard
                    evaluation={e}
                    projectName={getSubjectName(e)}
                    isRunPending={runEvaluation.isPending && runEvaluation.variables === e.id}
                    onRun={(ev) => handleRun(e.id, ev)}
                    onDelete={(ev) => handleDelete(e.id, ev)}
                    onCancel={(ev) => handleCancel(e.id, ev)}
                    onClick={() => navigate(`/evaluations/${e.id}`)}
                  />
                  {runningEvalId === e.id && Object.keys(nodes).length > 0 && (
                    <PipelineStepper nodes={nodes} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Evaluation</DialogTitle>
            <DialogDescription>
              Run an evaluation through the AI governance pipeline. Select what to evaluate.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Evaluate</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["application", "Application"],
                  ["dataset", "Dataset"],
                  ["mcp_server", "MCP Server"],
                  ["skill", "AI Skill"],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    variant={evalType === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => { resetDialog(); setEvalType(key); }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {evalType === "application" && (
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project">
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
              </div>
            )}
            {evalType === "dataset" && (
              <div className="space-y-2">
                <Label>Dataset</Label>
                <Select value={datasetId} onValueChange={(v) => setDatasetId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a dataset">
                      {(value: string) => value ? datasetMap[value] ?? value : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((d) => (
                      <SelectItem key={d.id} value={d.id} label={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {evalType === "mcp_server" && (
              <div className="space-y-2">
                <Label>MCP Server</Label>
                <Select value={mcpServerId} onValueChange={(v) => setMcpServerId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an MCP server">
                      {(value: string) => value ? mcpServerMap[value] ?? value : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {mcpServers.map((s) => (
                      <SelectItem key={s.id} value={s.id} label={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {evalType === "skill" && (
              <div className="space-y-2">
                <Label>AI Skill</Label>
                <Select value={skillId} onValueChange={(v) => setSkillId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a skill">
                      {(value: string) => value ? skillMap[value] ?? value : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {skills.map((s) => (
                      <SelectItem key={s.id} value={s.id} label={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="eval-model">Target model (optional)</Label>
              <Input
                id="eval-model"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g. gemini-2.5-flash, gpt-4o"
              />
              <p className="text-xs text-muted-foreground">
                Which LLM does the application being evaluated use? Helps flag model-specific risks.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createEvaluation.isPending || (
                  evalType === "application" ? !projectId :
                  evalType === "dataset" ? !datasetId :
                  evalType === "mcp_server" ? !mcpServerId :
                  !skillId
                )}
              >
                {createEvaluation.isPending ? "Creating..." : "Create Evaluation"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
