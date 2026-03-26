CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  official_website TEXT,
  official_twitter TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_status TEXT NOT NULL,
  collection_status TEXT NOT NULL,
  analysis_status TEXT NOT NULL,
  review_status TEXT NOT NULL,
  final_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS task_inputs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  input_type TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  is_official BOOLEAN NOT NULL,
  access_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  raw_content TEXT,
  credibility_level TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  payload_json TEXT,
  result_json TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ,
  lock_owner TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  collector_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  collected_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  evidence_count INTEGER NOT NULL,
  warnings_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS community_source_contexts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  target_label TEXT,
  target_kind TEXT,
  requested_window_hours INTEGER NOT NULL,
  effective_window_hours INTEGER,
  history_access_mode TEXT NOT NULL,
  bot_access_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS onchain_source_contexts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL UNIQUE REFERENCES sources(id) ON DELETE CASCADE,
  chain_key TEXT NOT NULL,
  chain_label TEXT NOT NULL,
  contract_role_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  final_score REAL NOT NULL,
  risk_level TEXT NOT NULL,
  summary TEXT NOT NULL,
  data_quality_note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_tasks_project_id ON analysis_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_inputs_task_id ON task_inputs(task_id);
CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);
CREATE INDEX IF NOT EXISTS idx_sources_project_id ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_evidences_task_id ON evidences(task_id);
CREATE INDEX IF NOT EXISTS idx_evidences_source_id ON evidences(source_id);
CREATE INDEX IF NOT EXISTS idx_worker_jobs_type_status_run_after ON worker_jobs(job_type, status, run_after);
CREATE INDEX IF NOT EXISTS idx_collection_runs_task_id ON collection_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_community_source_contexts_task_id ON community_source_contexts(task_id);
CREATE INDEX IF NOT EXISTS idx_onchain_source_contexts_task_id ON onchain_source_contexts(task_id);
