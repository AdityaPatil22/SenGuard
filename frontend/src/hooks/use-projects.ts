import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getProjects, createProject, updateProject, deleteProject } from "@/services/projects";
import api from "@/services/api";
import type { ApiResponse, CreateProjectRequest, GitHubRepo, UpdateProjectRequest } from "@/types/api";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: getProjects });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectRequest) => createProject(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProjectRequest }) => updateProject(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useGitHubRepos(enabled: boolean) {
  return useQuery({
    queryKey: ["github-repos"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<GitHubRepo[]>>("/auth/github/repos?per_page=100");
      return data.data;
    },
    enabled,
    staleTime: 60_000,
  });
}
