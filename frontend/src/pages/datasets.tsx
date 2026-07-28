import { Database, FileUp, Plus, Trash2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent, type DragEvent } from "react";

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
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ACCEPT = ".csv,.json,.jsonl,.txt,.tsv";

  function openCreate() {
    setName("");
    setDescription("");
    setProjectId("");
    setFile(null);
    setDragging(false);
    if (fileRef.current) fileRef.current.value = "";
    setCreateOpen(true);
  }

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      if (!name) setName(dropped.name.replace(/\.[^.]+$/, ""));
    }
  }, [name]);

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          <p className="text-sm text-muted-foreground">Upload and manage evaluation datasets for your projects</p>
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
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No datasets yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Upload evaluation datasets to include in your governance analysis. Supports CSV, JSON, JSONL, and TSV.
            </p>
            <Button size="sm" onClick={openCreate} className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Dataset
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
                  <TableCell className="text-muted-foreground">
                    {projectMap[d.project_id] ?? d.project_id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                    {d.description ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{d.record_count ?? "—"}</TableCell>
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
                <option value="" disabled>
                  Select a project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
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
              <Label>File</Label>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  setFile(picked);
                  if (picked && !name) setName(picked.name.replace(/\.[^.]+$/, ""));
                }}
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <FileUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <Upload className={`h-8 w-8 mb-2 ${dragging ? "text-primary" : "text-muted-foreground/50"}`} />
                  <p className="text-sm font-medium">
                    {dragging ? "Drop file here" : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">CSV, JSON, JSONL, TSV, or TXT</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createDataset.isPending || !projectId || !file} className="gap-2">
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
