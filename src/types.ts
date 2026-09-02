export interface SourceDirectory {
  id: string;
  path: string;
  label: string;
  source_type: string;
  is_default: boolean;
  icon: string | null;
  sort_order: number;
  is_protected: boolean;
  is_missing: boolean;
  added_at: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  local_path: string;
  repo_id: string | null;
  source_dir_id: string;
  relative_path: string;
  source_type: string; // "github" | "local" | "online"
  installed_at: string;
  updated_at: string;
  is_active: boolean;
  category: string;
  tags: string | null;
  skill_scope: string; // "loose" | "packed" | "repo"
  online_url: string | null;
  is_favorite: boolean;
  use_count: number;
}

export interface Repository {
  id: string;
  name: string;
  github_url: string | null;
  local_path: string;
  source_dir_id: string;
  source_type: string; // "github" or "local"
  current_branch: string | null;
  current_commit: string | null;
  last_checked: string | null;
  has_updates: boolean;
  added_at: string;
}

export interface GroupedRepo {
  id: string;
  name: string;
  path: string;
  source_type: string;
  source_dir_id: string | null;
  installed_at: string;
  updated_at: string;
  skills: Skill[];
  category: string | null;
  is_missing: boolean;
  repo_type: string; // single / collection
  author: string | null;
}

export interface PromptGroup {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  description: string | null;
  group_id: string | null;
  group_name?: string | null;
  tags: string | null;
  is_favorite: boolean;
  use_count: number;
  variables: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
