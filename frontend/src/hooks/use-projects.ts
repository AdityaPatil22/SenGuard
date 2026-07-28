import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getProjects, createProject, updateProject, deleteProject } from "@/services/projects";
import type { CreateProjectRequest, UpdateProjectRequest } from "@/types/api";

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
