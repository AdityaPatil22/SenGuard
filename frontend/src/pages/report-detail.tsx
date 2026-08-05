import { CheckCircle, Download, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCanReview } from "@/hooks/use-current-user";
import { useReports, useApproveReport, useRejectReport } from "@/hooks/use-reports";
import { exportReport } from "@/services/reports";
import type { ReportStatus } from "@/types/api";
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

export function ReportDetailPage() {
  const { id } = useParams();
  const { data: reports = [], isLoading } = useReports();
  const report = reports.find((r) => r.id === id);
  const approveReport = useApproveReport();
  const rejectReport = useRejectReport();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [approving, setApproving] = useState(false);
  const canReview = useCanReview();

  function handleApprove() {
    if (!report) return;
    setApproving(true);
    approveReport.mutate(report.id, {
      onSuccess: () => toast.success("Report approved"),
      onError: () => toast.error("Failed to approve report"),
      onSettled: () => setApproving(false),
    });
  }

  function handleReject(e: FormEvent) {
    e.preventDefault();
    if (!report) return;
    rejectReport.mutate(
      { id: report.id, comment: rejectComment },
      {
        onSuccess: () => {
          toast.success("Report rejected");
          setRejectOpen(false);
          setRejectComment("");
        },
        onError: () => toast.error("Failed to reject report"),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Report not found.</p>
        <Link to="/reports" className="text-sm text-primary underline underline-offset-4 hover:text-primary/80">
          Back to Reports
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/reports" />}>Reports</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{report.project_name || report.id.slice(0, 8)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="sticky top-0 z-10 bg-background border-b py-4 -mx-4 px-4 md:-mx-6 md:px-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Badge variant={STATUS_VARIANT[report.status]}>{STATUS_LABEL[report.status]}</Badge>
            {report.risk_score != null && (
              <span className={`font-mono text-sm font-bold ${riskColor(report.risk_score)}`}>
                {report.risk_score.toFixed(0)} &middot; {riskLabel(report.risk_score)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {report.status === "in_review" && canReview && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-success"
                  disabled={approving}
                  onClick={handleApprove}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  {approving ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive"
                  onClick={() => setRejectOpen(true)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => exportReport(report.id)}
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </Button>
          </div>
        </div>
      </div>

      {report.status === "rejected" && report.rejection_comment && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive mb-1">Rejection Reason</p>
          <p className="text-sm">{report.rejection_comment}</p>
        </div>
      )}

      <Separator />

      {report.content ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{report.content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No report content available.</p>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
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
              <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>
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
