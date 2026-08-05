import api from "./api";
import type { ApiResponse, Dataset } from "@/types/api";

export async function getDatasets() {
  const { data } = await api.get<ApiResponse<Dataset[]>>("/datasets");
  return data.data;
}

export async function createDataset(body: { name: string; description?: string; file?: File }) {
  const form = new FormData();
  form.append("name", body.name);
  if (body.description) form.append("description", body.description);
  if (body.file) form.append("file", body.file);
  const { data } = await api.post<ApiResponse<Dataset>>("/datasets", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data;
}

export async function deleteDataset(id: string) {
  const { data } = await api.delete<ApiResponse<void>>(`/datasets/${id}`);
  return data.data;
}
