import { CheckCircle, Download, Eye, FileText, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useReports, useApproveReport, useRejectReport } from "@/hooks/use-reports";
import { exportReport } from "@/services/reports";
import type { Report, ReportStatus } from "@/types/api";
import { riskColor, riskLabel, renderMarkdown } from "@/lib/utils";

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

function ReportViewModal({ report, onClose }: { report: Report; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{report.project_name || "Report"}</DialogTitle>
          <DialogDescription>
            Generated on {formatDate(report.created_at)}
            {report.risk_score != null && ` · ${riskLabel(report.risk_score)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[report.status]}>{STATUS_LABEL[report.status]}</Badge>
            {report.risk_score != null && (
              <span className={`font-mono text-sm font-bold ${riskColor(report.risk_score)}`}>
                {report.risk_score.toFixed(0)}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportReport(report.id)}>
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </Button>
        </div>

        <Separator className="my-3" />

        {report.status === "rejected" && report.rejection_comment && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-3">
            <p className="text-sm font-medium text-destructive mb-1">Rejection Reason</p>
            <p className="text-sm">{report.rejection_comment}</p>
          </div>
        )}

        {report.content ? (
          <div
            className="text-sm text-foreground leading-relaxed max-h-[60vh] overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.content) }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No report content available.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReportsPage() {
  const { data: reports = [], isLoading } = useReports();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const [rejectDialog, setRejectDialog] = useState<Report | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [viewReport, setViewReport] = useState<Report | null>(null);

  function handleApprove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setApprovingId(id);
    approveReport.mutate(id, { onSettled: () => setApprovingId(null) });
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
          setRejectDialog(null);
          setRejectComment("");
        },
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
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card
              key={r.id}
              className="transition-colors hover:bg-muted/30 cursor-pointer"
              onClick={() => setViewReport(r)}
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
                    <div className="flex gap-1">
                      {r.status === "in_review" && (
                        <>
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
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setViewReport(r);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">View</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewReport && <ReportViewModal report={viewReport} onClose={() => setViewReport(null)} />}

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
