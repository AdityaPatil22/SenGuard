import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getMcpServers, createMcpServer, updateMcpServer, deleteMcpServer } from "@/services/mcp-servers";
import type { CreateMcpServerRequest, UpdateMcpServerRequest } from "@/types/api";

export function useMcpServers() {
  return useQuery({ queryKey: ["mcp-servers"], queryFn: () => getMcpServers() });
}

export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMcpServerRequest) => createMcpServer(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useUpdateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMcpServerRequest }) => updateMcpServer(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}
