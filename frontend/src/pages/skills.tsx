import { Plus, Search, Sparkles, Trash2 } from "lucide-react";
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
import { useSkills, useCreateSkill, useDeleteSkill } from "@/hooks/use-skills";
import type { Skill, SkillType } from "@/types/api";

const SKILL_TYPE_VARIANT: Record<SkillType, "default" | "secondary" | "warning"> = {
  prompt: "secondary",
  agent: "default",
  plugin: "warning",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SkillsPage() {
  const { data: skills = [], isLoading } = useSkills();
  const createMut = useCreateSkill();
  const deleteMut = useDeleteSkill();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skillType, setSkillType] = useState<SkillType>("prompt");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(q) || s.skill_type.includes(q));
  }, [skills, searchQuery]);

  function openCreate() {
    setName("");
    setDescription("");
    setSkillType("prompt");
    setContent("");
    setFile(null);
    setCreateOpen(true);
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMut.mutate(
      {
        name,
        skill_type: skillType,
        description: description || undefined,
        content: content || undefined,
        file: file ?? undefined,
      },
      {
        onSuccess: () => { setCreateOpen(false); toast.success("Skill created"); },
        onError: () => toast.error("Failed to create skill"),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => { setDeleteTarget(null); toast.success("Skill deleted"); },
      onError: () => { setDeleteTarget(null); toast.error("Failed to delete skill"); },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Skills</h1>
          <p className="text-sm text-muted-foreground">Register prompts, agent configs, and plugin packages for governance evaluation</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Skill
        </Button>
      </div>

      {!isLoading && skills.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search skills..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-6 space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Sparkles className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No AI skills yet</EmptyTitle>
                <EmptyDescription>Register a system prompt, agent configuration, or plugin package to evaluate for safety and governance risks.</EmptyDescription>
              </EmptyHeader>
              <Button size="sm" onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />New Skill</Button>
            </Empty>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Search className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No matching skills</EmptyTitle>
                <EmptyDescription>No skills match "{searchQuery}".</EmptyDescription>
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
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant={SKILL_TYPE_VARIANT[s.skill_type]}>{s.skill_type}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground"><span className="block max-w-xs truncate">{s.description ?? "—"}</span></TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{formatDate(s.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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
            <AlertDialogTitle>Delete skill?</AlertDialogTitle>
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
            <DialogTitle>New AI Skill</DialogTitle>
            <DialogDescription>Register a prompt, agent config, or plugin for evaluation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="skill-name">Name</Label>
              <Input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My AI Skill" required />
            </div>
            <div className="space-y-2">
              <Label>Skill Type</Label>
              <div className="flex gap-2">
                {(["prompt", "agent", "plugin"] as const).map((t) => (
                  <Button key={t} type="button" variant={skillType === t ? "default" : "outline"} size="sm" className="flex-1 capitalize" onClick={() => setSkillType(t)}>{t}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-desc">Description</Label>
              <Textarea id="skill-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this skill do?" rows={2} className="max-h-32 overflow-y-auto" />
            </div>
            {skillType !== "plugin" ? (
              <div className="space-y-2">
                <Label htmlFor="skill-content">{skillType === "prompt" ? "System Prompt" : "Agent Configuration"}</Label>
                <Textarea id="skill-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder={skillType === "prompt" ? "You are a helpful assistant that..." : "model: gpt-4o\ntools:\n  - ..."} rows={8} className="font-mono text-xs max-h-60 overflow-y-auto" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="skill-file">Plugin Package</Label>
                <div className="flex items-center gap-2">
                  <Input id="skill-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1" />
                  {file && <span className="text-xs text-muted-foreground truncate max-w-30">{file.name}</span>}
                </div>
                <p className="text-xs text-muted-foreground">Upload the plugin source code or package (max 50MB).</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Create"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
