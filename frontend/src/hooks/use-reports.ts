import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getReports, getReport, approveReport, rejectReport } from "@/services/reports";

export function useReports() {
  return useQuery({ queryKey: ["reports"], queryFn: getReports });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: ["reports", id],
    queryFn: () => getReport(id!),
    enabled: !!id,
  });
}

export function useApproveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveReport(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["reports", id] });
    },
  });
}

export function useRejectReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectReport(id, comment),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["reports", id] });
    },
  });
}
