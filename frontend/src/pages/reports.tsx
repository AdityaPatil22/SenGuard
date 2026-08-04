import { CheckCircle, FileText, Search, XCircle } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useReports, useApproveReport, useRejectReport } from "@/hooks/use-reports";
import type { Report, ReportStatus } from "@/types/api";
import { riskColor, riskLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<ReportStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  pending_review: "warning",
  in_review: "warning",
  approved: "success",
  rejected: "destructive",
  published: "success",
  archived: "default",
};

const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  archived: "Archived",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { data: reports = [], isLoading } = useReports();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const [rejectDialog, setRejectDialog] = useState<Report | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter((r) => (r.project_name || "").toLowerCase().includes(q));
  }, [reports, search]);

  function handleApprove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setApprovingId(id);
    approveReport.mutate(id, {
      onSuccess: () => toast.success("Report approved"),
      onError: () => toast.error("Failed to approve report"),
      onSettled: () => setApprovingId(null),
    });
  }

  function openReject(report: Report, e: React.MouseEvent) {
    e.stopPropagation();
    setRejectDialog(report);
  }

  function handleReject(e: FormEvent) {
    e.preventDefault();
    if (!rejectDialog) return;
    rejectReport.mutate(
      { id: rejectDialog.id, comment: rejectComment },
      {
        onSuccess: () => {
          toast.success("Report rejected");
          setRejectDialog(null);
          setRejectComment("");
        },
        onError: () => toast.error("Failed to reject report"),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Review AI governance reports and approve or reject for compliance
        </p>
      </div>

      {!isLoading && reports.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by project name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

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
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1">No reports yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Reports are automatically generated after an evaluation completes. Run an evaluation on a project to see
              results here.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No reports match your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className="transition-colors hover:bg-muted/30 cursor-pointer"
              onClick={() => navigate(`/reports/${r.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      r.status === "approved" || r.status === "published"
                        ? "bg-success/10"
                        : r.status === "rejected"
                          ? "bg-destructive/10"
                          : "bg-muted"
                    }`}
                  >
                    <FileText
                      className={`h-5 w-5 ${
                        r.status === "approved" || r.status === "published"
                          ? "text-success"
                          : r.status === "rejected"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{r.project_name || r.id.slice(0, 8)}</p>
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(r.created_at)}
                      {r.status === "rejected" && r.rejection_comment && (
                        <span className="text-destructive"> &middot; {r.rejection_comment.slice(0, 60)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.risk_score != null && (
                      <div className="text-right hidden sm:block">
                        <p className={`text-lg font-bold font-mono ${riskColor(r.risk_score)}`}>
                          {r.risk_score.toFixed(0)}
                        </p>
                        <p className={`text-[10px] font-medium ${riskColor(r.risk_score)}`}>
                          {riskLabel(r.risk_score)}
                        </p>
                      </div>
                    )}
                    {r.status === "in_review" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-success"
                          disabled={approvingId === r.id}
                          onClick={(ev) => handleApprove(r.id, ev)}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            {approvingId === r.id ? "..." : "Approve"}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive"
                          onClick={(ev) => openReject(r, ev)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Reject</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!rejectDialog}
        onOpenChange={(open) => {
          if (!open) setRejectDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Report</DialogTitle>
            <DialogDescription>
              Provide a reason for rejection. The report author will see this feedback.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReject} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="reject-comment">Reason for rejection</Label>
              <Textarea
                id="reject-comment"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="What needs to change before this report can be approved?"
                required
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRejectDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={rejectReport.isPending}>
                {rejectReport.isPending ? "Rejecting..." : "Reject Report"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
