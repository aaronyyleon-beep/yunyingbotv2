CREATE TABLE IF NOT EXISTS factors (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  factor_key TEXT NOT NULL,
  factor_name TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  status TEXT NOT NULL,
  ai_score REAL,
  final_score REAL,
  confidence_level TEXT NOT NULL,
  score_reason TEXT NOT NULL,
  risk_points_json TEXT NOT NULL,
  opportunity_points_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL,
  dimension_name TEXT NOT NULL,
  final_score REAL NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS review_records (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  factor_id TEXT NOT NULL REFERENCES factors(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  old_ai_score REAL,
  old_final_score REAL,
  override_score REAL NOT NULL,
  new_final_score REAL NOT NULL,
  fact_supplement TEXT,
  override_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS report_versions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  version_type TEXT NOT NULL,
  factor_snapshot_json TEXT NOT NULL,
  dimension_snapshot_json TEXT NOT NULL,
  report_snapshot_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_factors_task_id ON factors(task_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_task_id ON dimensions(task_id);
CREATE INDEX IF NOT EXISTS idx_review_records_task_id ON review_records(task_id);
CREATE INDEX IF NOT EXISTS idx_report_versions_task_id ON report_versions(task_id);
