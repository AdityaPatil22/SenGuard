import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { getSkills, createSkill, deleteSkill } from "@/services/skills";
import type { CreateSkillRequest } from "@/types/api";

export function useSkills() {
  return useQuery({ queryKey: ["skills"], queryFn: () => getSkills() });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSkillRequest) => createSkill(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
