import { Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDatasets, useCreateDataset, useDeleteDataset } from "@/hooks/use-datasets";
import { useProjects } from "@/hooks/use-projects";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DatasetsPage() {
  const { data: datasets = [], isLoading } = useDatasets();
  const { data: projects = [] } = useProjects();
  const createDataset = useCreateDataset();
  const deleteDatasetMut = useDeleteDataset();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setName("");
    setDescription("");
    setProjectId("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setCreateOpen(true);
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createDataset.mutate(
      { name, project_id: projectId, description: description || undefined, file: file ?? undefined },
      { onSuccess: () => setCreateOpen(false) },
    );
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    deleteDatasetMut.mutate(id, { onSettled: () => setDeletingId(null) });
  }

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
          <p className="text-sm text-muted-foreground">Evaluation datasets linked to projects</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Upload Dataset
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
      ) : datasets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No datasets yet</p>
            <Button variant="link" size="sm" onClick={openCreate}>
              Upload your first dataset
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="hidden sm:table-cell">Records</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{projectMap[d.project_id] ?? d.project_id.slice(0, 8)}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                    {d.description ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {d.record_count ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatDate(d.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={deletingId === d.id}
                      onClick={() => handleDelete(d.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Dataset</DialogTitle>
            <DialogDescription>Add an evaluation dataset to a project.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="ds-name">Name</Label>
              <Input
                id="ds-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dataset name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-project">Project</Label>
              <Select id="ds-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                <option value="" disabled>Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-desc">Description</Label>
              <Textarea
                id="ds-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this dataset contain?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-file">File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ds-file"
                  ref={fileRef}
                  type="file"
                  accept=".csv,.json,.jsonl,.txt,.tsv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <p className="text-xs text-muted-foreground">CSV, JSON, JSONL, TSV, or TXT</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createDataset.isPending || !projectId} className="gap-2">
                <Upload className="h-4 w-4" />
                {createDataset.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
