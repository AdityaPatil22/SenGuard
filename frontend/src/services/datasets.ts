import api from "./api";
import type { ApiResponse, Dataset } from "@/types/api";

export async function getDatasets(projectId?: string) {
  const params = projectId ? { project_id: projectId } : {};
  const { data } = await api.get<ApiResponse<Dataset[]>>("/datasets", { params });
  return data.data;
}

export async function getDataset(id: string) {
  const { data } = await api.get<ApiResponse<Dataset>>(`/datasets/${id}`);
  return data.data;
}

export async function createDataset(body: { name: string; project_id: string; description?: string; file?: File }) {
  const form = new FormData();
  form.append("name", body.name);
  form.append("project_id", body.project_id);
  if (body.description) form.append("description", body.description);
  if (body.file) form.append("file", body.file);
  const { data } = await api.post<ApiResponse<Dataset>>("/datasets", form);
  return data.data;
}

export async function deleteDataset(id: string) {
  const { data } = await api.delete<ApiResponse<void>>(`/datasets/${id}`);
  return data.data;
}
