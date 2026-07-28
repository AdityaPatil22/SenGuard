import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getReports, approveReport, rejectReport } from "@/services/reports";

export function useReports() {
  return useQuery({ queryKey: ["reports"], queryFn: getReports });
}

export function useApproveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useRejectReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectReport(id, comment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}
