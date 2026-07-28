import api from "./api";
import type { ApiResponse, Evaluation, CreateEvaluationRequest } from "@/types/api";

export async function getEvaluations() {
  const { data } = await api.get<ApiResponse<Evaluation[]>>("/evaluations");
  return data.data;
}

export async function createEvaluation(body: CreateEvaluationRequest) {
  const { data } = await api.post<ApiResponse<Evaluation>>("/evaluations", body);
  return data.data;
}

export async function runEvaluation(id: string) {
  const { data } = await api.post<ApiResponse<Evaluation>>(`/evaluations/${id}/run`);
  return data.data;
}
