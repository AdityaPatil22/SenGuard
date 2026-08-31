export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export interface User {
  id: string;
  github_username: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export type ProjectStatus = "draft" | "submitted" | "evaluating" | "evaluated" | "approved" | "rejected";
export type EvaluationStatus = "pending" | "running" | "completed" | "failed";
export type ReportStatus = "draft" | "in_review" | "approved" | "rejected";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repo_url: string | null;
  repo_full_name: string | null;
  status: ProjectStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  evaluation_type: "application" | "dataset" | "mcp_server" | "skill" | "standalone";
  status: EvaluationStatus;
  risk_score: number | null;
  summary: string | null;
  model_name: string | null;
  node_results: Record<string, unknown> | null;
  error_message: string | null;
  project_id: string | null;
  dataset_id: string | null;
  mcp_server_id: string | null;
  skill_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEvaluationRequest {
  project_id?: string;
  dataset_id?: string;
  mcp_server_id?: string;
  skill_id?: string;
  model_name?: string;
}

export interface Report {
  id: string;
  content: string | null;
  status: ReportStatus;
  rejection_comment: string | null;
  evaluation_id: string;
  evaluation_type: "application" | "dataset" | "mcp_server" | "skill" | "standalone";
  reviewer_id: string | null;
  project_id: string | null;
  subject_name: string | null;
  risk_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  file_path: string | null;
  record_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  repo_url?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  repo_url?: string;
}

export interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  language: string | null;
  html_url: string;
}

export type SkillType = "prompt" | "agent" | "plugin";

export interface McpServer {
  id: string;
  name: string;
  description: string | null;
  manifest: Record<string, unknown> | null;
  repo_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  skill_type: SkillType;
  content: string | null;
  file_path: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMcpServerRequest {
  name: string;
  description?: string;
  manifest?: Record<string, unknown>;
  repo_url?: string;
}

export interface UpdateMcpServerRequest {
  name?: string;
  description?: string;
  manifest?: Record<string, unknown>;
  repo_url?: string;
}

export interface CreateSkillRequest {
  name: string;
  skill_type: SkillType;
  description?: string;
  content?: string;
  file?: File;
}
