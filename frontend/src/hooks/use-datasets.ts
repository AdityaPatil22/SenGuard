import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getDatasets, createDataset, deleteDataset } from "@/services/datasets";

export function useDatasets() {
  return useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
}

export function useCreateDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; file?: File }) => createDataset(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDataset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }),
  });
}
