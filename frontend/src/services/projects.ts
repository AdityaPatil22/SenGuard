import api from "./api";
import type { ApiResponse, Project, CreateProjectRequest, UpdateProjectRequest } from "@/types/api";

export async function getProjects() {
  const { data } = await api.get<ApiResponse<Project[]>>("/projects");
  return data.data;
}

export async function createProject(body: CreateProjectRequest) {
  const { data } = await api.post<ApiResponse<Project>>("/projects", body);
  return data.data;
}

export async function updateProject(id: string, body: UpdateProjectRequest) {
  const { data } = await api.put<ApiResponse<Project>>(`/projects/${id}`, body);
  return data.data;
}

export async function deleteProject(id: string) {
  const { data } = await api.delete<ApiResponse<void>>(`/projects/${id}`);
  return data.data;
}
