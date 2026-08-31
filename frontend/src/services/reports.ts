import api from "./api";
import type { ApiResponse, Report } from "@/types/api";

export async function getReports() {
  const { data } = await api.get<ApiResponse<Report[]>>("/reports");
  return data.data;
}

export async function getReport(id: string) {
  const { data } = await api.get<ApiResponse<Report>>(`/reports/${id}`);
  return data.data;
}

export async function approveReport(id: string) {
  const { data } = await api.post<ApiResponse<Report>>(`/reports/${id}/approve`);
  return data.data;
}

export async function rejectReport(id: string, comment: string) {
  const { data } = await api.post<ApiResponse<Report>>(`/reports/${id}/reject`, { comment });
  return data.data;
}

export async function exportReport(id: string) {
  const { data } = await api.get(`/reports/${id}/export`, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
