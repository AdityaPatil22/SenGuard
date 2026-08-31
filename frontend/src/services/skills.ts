import api from "./api";
import type { ApiResponse, Skill, CreateSkillRequest } from "@/types/api";

export async function getSkills() {
  const { data } = await api.get<ApiResponse<Skill[]>>("/skills");
  return data.data;
}

export async function getSkill(id: string) {
  const { data } = await api.get<ApiResponse<Skill>>(`/skills/${id}`);
  return data.data;
}

export async function createSkill(body: CreateSkillRequest) {
  const form = new FormData();
  form.append("name", body.name);
  form.append("skill_type", body.skill_type);
  if (body.description) form.append("description", body.description);
  if (body.content) form.append("content", body.content);
  if (body.file) form.append("file", body.file);
  const { data } = await api.post<ApiResponse<Skill>>("/skills", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data;
}

export async function deleteSkill(id: string) {
  const { data } = await api.delete<ApiResponse<void>>(`/skills/${id}`);
  return data.data;
}
