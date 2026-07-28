import { CheckCircle, Download, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useReports, useApproveReport, useRejectReport } from "@/hooks/use-reports";
import { exportReport } from "@/services/reports";
import type { Report, ReportStatus } from "@/types/api";

const STATUS_VARIANT: Record<ReportStatus, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  in_review: "warning",
  approved: "success",
  rejected: "destructive",
};

const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
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

export function ReportsPage() {
  const { data: reports = [], isLoading } = useReports();
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const [rejectDialog, setRejectDialog] = useState<Report | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  function handleApprove(id: string) {
    setApprovingId(id);
    approveReport.mutate(id, { onSettled: () => setApprovingId(null) });
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
        <p className="text-sm text-muted-foreground">Governance reports for review and approval</p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No reports yet</p>
            <p className="text-xs text-muted-foreground mt-1">Reports are generated after evaluations complete</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead className="hidden md:table-cell">Content</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.project_name ?? r.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`font-mono text-sm font-medium ${riskColor(r.risk_score)}`}>
                      {r.risk_score != null ? r.risk_score.toFixed(2) : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                    {r.status === "rejected" && r.rejection_comment
                      ? r.rejection_comment
                      : r.content ?? "No content"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {formatDate(r.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.status === "in_review" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-success"
                            disabled={approvingId === r.id}
                            onClick={() => handleApprove(r.id)}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {approvingId === r.id ? "..." : "Approve"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-destructive"
                            onClick={() => setRejectDialog(r)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => exportReport(r.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!rejectDialog} onOpenChange={(open) => { if (!open) setRejectDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Report</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this report.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReject} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="reject-comment">Comment</Label>
              <Textarea
                id="reject-comment"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Reason for rejection..."
                required
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRejectDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={rejectReport.isPending}>
                {rejectReport.isPending ? "Rejecting..." : "Reject"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
