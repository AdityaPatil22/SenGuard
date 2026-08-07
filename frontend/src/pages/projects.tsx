import { FolderKanban, Github, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState, useMemo, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject, useGitHubRepos } from "@/hooks/use-projects";
import type { GitHubRepo, Project, ProjectStatus } from "@/types/api";

const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  submitted: "default",
  evaluating: "warning",
  evaluated: "default",
  approved: "success",
  rejected: "destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProjectMut = useUpdateProject();
  const deleteProjectMut = useDeleteProject();

  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const { data: githubRepos = [], isLoading: loadingRepos } = useGitHubRepos(showRepoPicker);

  const filteredRepos = useMemo(() => {
    if (!repoSearch) return githubRepos;
    const q = repoSearch.toLowerCase();
    return githubRepos.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q),
    );
  }, [githubRepos, repoSearch]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  function openCreate() {
    setName("");
    setDescription("");
    setRepoUrl("");
    setShowRepoPicker(false);
    setRepoSearch("");
    setCreateOpen(true);
  }

  function openEdit(p: Project) {
    setName(p.name);
    setDescription(p.description ?? "");
    setRepoUrl(p.repo_url ?? "");
    setEditProject(p);
  }

  function selectRepo(repo: GitHubRepo) {
    setName(repo.name);
    setDescription(repo.description ?? "");
    setRepoUrl(repo.html_url);
    setShowRepoPicker(false);
    setRepoSearch("");
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createProject.mutate(
      { name, description: description || undefined, repo_url: repoUrl || undefined },
      {
        onSuccess: () => {
          setCreateOpen(false);
          toast.success("Project created");
        },
        onError: () => toast.error("Failed to create project"),
      },
    );
  }

  function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editProject) return;
    updateProjectMut.mutate(
      { id: editProject.id, body: { name, description: description || undefined, repo_url: repoUrl || undefined } },
      {
        onSuccess: () => {
          setEditProject(null);
          toast.success("Project updated");
        },
        onError: () => toast.error("Failed to update project"),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteProjectMut.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast.success("Project deleted");
      },
      onError: () => {
        setDeleteTarget(null);
        toast.error("Failed to delete project");
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Import and manage AI projects for governance evaluation</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Search */}
      {!isLoading && projects.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanban className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>
                  Import a GitHub repository to get started with AI governance evaluation.
                </EmptyDescription>
              </EmptyHeader>
              <Button size="sm" onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </Empty>
          </CardContent>
        </Card>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No matching projects</EmptyTitle>
                <EmptyDescription>
                  No projects match "{searchQuery}". Try a different search term.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Repository</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link to={`/projects/${p.id}`} className="hover:underline underline-offset-4">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {p.repo_full_name ? (
                      <a
                        href={p.repo_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                      >
                        <Github className="h-3.5 w-3.5" />
                        {p.repo_full_name}
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                    {p.description ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatDate(p.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium">{deleteTarget?.name}</span> along with all its evaluations, reports, and datasets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {deleteProjectMut.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Import a GitHub repository for governance evaluation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            {!showRepoPicker ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowRepoPicker(true)}
              >
                <Github className="h-4 w-4" />
                Import from GitHub
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search repositories..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                  {loadingRepos ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">Loading repos...</div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">No repos found</div>
                  ) : (
                    filteredRepos.map((repo) => (
                      <button
                        key={repo.full_name}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                        onClick={() => selectRepo(repo)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{repo.full_name}</span>
                          {repo.language && (
                            <span className="text-xs text-muted-foreground">{repo.language}</span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{repo.description}</p>
                        )}
                      </button>
                    ))
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowRepoPicker(false);
                    setRepoSearch("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My AI Project"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-desc">Description</Label>
              <Textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this AI application do?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-repo">Repository URL</Label>
              <Input
                id="project-repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {createProject.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editProject}
        onOpenChange={(open) => {
          if (!open) setEditProject(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update project details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My AI Project"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this AI application do?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-repo">Repository URL</Label>
              <Input
                id="edit-repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditProject(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateProjectMut.isPending}>
                {updateProjectMut.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
