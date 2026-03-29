ALTER TABLE analysis_tasks
  ADD COLUMN IF NOT EXISTS fresh_evidence_ready BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS last_collected_at TIMESTAMPTZ;

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS last_evidence_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_analysis_tasks_fresh_evidence_ready ON analysis_tasks(fresh_evidence_ready);
