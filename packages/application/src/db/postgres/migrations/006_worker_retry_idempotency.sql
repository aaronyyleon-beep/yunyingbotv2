ALTER TABLE worker_jobs
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE worker_jobs
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE worker_jobs
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_jobs_dedupe_active
  ON worker_jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_worker_jobs_retry_schedule
  ON worker_jobs(status, next_retry_at);
