import { Pencil, Plus, Search, Server, Trash2 } from "lucide-react";
import { useState, useMemo, type FormEvent } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMcpServers, useCreateMcpServer, useUpdateMcpServer, useDeleteMcpServer } from "@/hooks/use-mcp-servers";
import type { McpServer } from "@/types/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function McpServersPage() {
  const { data: servers = [], isLoading } = useMcpServers();
  const createMut = useCreateMcpServer();
  const updateMut = useUpdateMcpServer();
  const deleteMut = useDeleteMcpServer();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<McpServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [manifestJson, setManifestJson] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery) return servers;
    const q = searchQuery.toLowerCase();
    return servers.filter((s) => s.name.toLowerCase().includes(q));
  }, [servers, searchQuery]);

  function openCreate() {
    setName("");
    setDescription("");
    setRepoUrl("");
    setManifestJson("");
    setCreateOpen(true);
  }

  function openEdit(s: McpServer) {
    setName(s.name);
    setDescription(s.description ?? "");
    setRepoUrl(s.repo_url ?? "");
    setManifestJson(s.manifest ? JSON.stringify(s.manifest, null, 2) : "");
    setEditTarget(s);
  }

  function parseManifest(): Record<string, unknown> | undefined {
    if (!manifestJson.trim()) return undefined;
    try {
      return JSON.parse(manifestJson);
    } catch {
      toast.error("Invalid JSON in manifest field");
      return undefined;
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const manifest = manifestJson.trim() ? parseManifest() : undefined;
    if (manifestJson.trim() && manifest === undefined) return;
    createMut.mutate(
      { name, description: description || undefined, repo_url: repoUrl || undefined, manifest },
      {
        onSuccess: () => { setCreateOpen(false); toast.success("MCP server created"); },
        onError: () => toast.error("Failed to create MCP server"),
      },
    );
  }

  function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const manifest = manifestJson.trim() ? parseManifest() : undefined;
    if (manifestJson.trim() && manifest === undefined) return;
    updateMut.mutate(
      { id: editTarget.id, body: { name, description: description || undefined, repo_url: repoUrl || undefined, manifest } },
      {
        onSuccess: () => { setEditTarget(null); toast.success("MCP server updated"); },
        onError: () => toast.error("Failed to update MCP server"),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => { setDeleteTarget(null); toast.success("MCP server deleted"); },
      onError: () => { setDeleteTarget(null); toast.error("Failed to delete MCP server"); },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MCP Servers</h1>
          <p className="text-sm text-muted-foreground">Register MCP server configurations for governance evaluation</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New MCP Server
        </Button>
      </div>

      {!isLoading && servers.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search servers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Server className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No MCP servers yet</EmptyTitle>
                <EmptyDescription>Register an MCP server manifest or repository to evaluate its security and governance posture.</EmptyDescription>
              </EmptyHeader>
              <Button size="sm" onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />New MCP Server</Button>
            </Empty>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Search className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No matching servers</EmptyTitle>
                <EmptyDescription>No MCP servers match "{searchQuery}".</EmptyDescription>
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
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="hidden lg:table-cell">Repository</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">{s.description ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{s.repo_url ? <a href={s.repo_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.repo_url}</a> : "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{formatDate(s.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP server?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete <span className="font-medium">{deleteTarget?.name}</span>. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>{deleteMut.isPending ? "Deleting..." : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New MCP Server</DialogTitle>
            <DialogDescription>Register an MCP server for governance evaluation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="server-name">Name</Label>
              <Input id="server-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP Server" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-desc">Description</Label>
              <Textarea id="server-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this MCP server do?" rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-repo">Repository URL</Label>
              <Input id="server-repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/mcp-server" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="server-manifest">Manifest JSON</Label>
              <Textarea id="server-manifest" value={manifestJson} onChange={(e) => setManifestJson(e.target.value)} placeholder='{"mcpServers": {...}}' rows={5} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Paste the contents of your .mcp.json or server configuration.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Create"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit MCP Server</DialogTitle>
            <DialogDescription>Update MCP server details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-server-name">Name</Label>
              <Input id="edit-server-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP Server" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-server-desc">Description</Label>
              <Textarea id="edit-server-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this MCP server do?" rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-server-repo">Repository URL</Label>
              <Input id="edit-server-repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/mcp-server" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-server-manifest">Manifest JSON</Label>
              <Textarea id="edit-server-manifest" value={manifestJson} onChange={(e) => setManifestJson(e.target.value)} placeholder='{"mcpServers": {...}}' rows={5} className="font-mono text-xs" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMut.isPending}>{updateMut.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
