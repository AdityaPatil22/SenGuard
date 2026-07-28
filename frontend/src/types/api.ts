export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  errors: unknown[];
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  github_username: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

export type ProjectStatus = "draft" | "submitted" | "evaluating" | "evaluated" | "approved" | "rejected";
export type EvaluationStatus = "pending" | "running" | "completed" | "failed";
export type ReportStatus = "draft" | "published" | "archived";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  status: EvaluationStatus;
  risk_score: number | null;
  summary: string | null;
  model_name: string | null;
  node_results: Record<string, unknown> | null;
  error_message: string | null;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEvaluationRequest {
  project_id: string;
  model_name?: string;
}

export interface Report {
  id: string;
  content: string | null;
  status: ReportStatus;
  evaluation_id: string;
  reviewer_id: string | null;
  created_at: string;
  updated_at: string;
  evaluation?: Evaluation;
}

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  file_path: string | null;
  record_count: number | null;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}
