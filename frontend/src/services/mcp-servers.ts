import api from "./api";
import type { ApiResponse, McpServer, CreateMcpServerRequest, UpdateMcpServerRequest } from "@/types/api";

export async function getMcpServers() {
  const { data } = await api.get<ApiResponse<McpServer[]>>("/mcp-servers");
  return data.data;
}

export async function getMcpServer(id: string) {
  const { data } = await api.get<ApiResponse<McpServer>>(`/mcp-servers/${id}`);
  return data.data;
}

export async function createMcpServer(body: CreateMcpServerRequest) {
  const { data } = await api.post<ApiResponse<McpServer>>("/mcp-servers", body);
  return data.data;
}

export async function updateMcpServer(id: string, body: UpdateMcpServerRequest) {
  const { data } = await api.put<ApiResponse<McpServer>>(`/mcp-servers/${id}`, body);
  return data.data;
}

export async function deleteMcpServer(id: string) {
  const { data } = await api.delete<ApiResponse<void>>(`/mcp-servers/${id}`);
  return data.data;
}
