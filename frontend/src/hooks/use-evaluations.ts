import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getEvaluations, createEvaluation, runEvaluation } from "@/services/evaluations";
import type { CreateEvaluationRequest } from "@/types/api";

export function useEvaluations() {
  return useQuery({ queryKey: ["evaluations"], queryFn: getEvaluations });
}

export function useCreateEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEvaluationRequest) => createEvaluation(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evaluations"] }),
  });
}

export function useRunEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runEvaluation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evaluations"] }),
  });
}
