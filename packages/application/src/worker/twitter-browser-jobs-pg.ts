import { createHash, randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

export type TwitterBrowserJobStatus = "queued" | "running" | "completed" | "failed" | "dead_letter";

export interface EnqueueTwitterBrowserJobResult {
  jobId: string;
  status: TwitterBrowserJobStatus;
  deduped: boolean;
}

export interface ClaimedTwitterBrowserJob {
  jobId: string;
  taskId: string;
  dedupeKey: string | null;
  attempts: number;
  maxAttempts: number;
}

const nowIso = () => new Date().toISOString();
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

const classifyJobErrorCode = (errorMessage: string): string => {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("no supported browser executable")) return "no_supported_browser_executable";
  if (normalized.includes("storage state file not found")) return "twitter_storage_state_missing";
  if (normalized.includes("login wall")) return "twitter_login_wall";
  if (normalized.includes("timeout")) return "timeout";
  if (normalized.includes("task_not_found")) return "task_not_found";
  return "unknown_error";
};

const buildTwitterBrowserDedupeKey = async (db: AppDbClient, taskId: string) => {
  const sourceRows = await db.query<{
    source_type: string;
    source_url: string;
    requested_window_hours: number | null;
  }>(
    `SELECT
       s.source_type,
       s.source_url,
       c.requested_window_hours
     FROM sources s
     LEFT JOIN community_source_contexts c ON c.source_id = s.id AND c.task_id = s.task_id
     WHERE s.task_id = $1
       AND s.source_type = 'twitter'
     ORDER BY s.source_url ASC`,
    [taskId]
  );

  const normalized = sourceRows.map((row) => ({
    sourceType: row.source_type,
    sourceUrl: row.source_url.trim().toLowerCase(),
    requestedWindowHours: row.requested_window_hours ?? "default"
  }));

  const material = JSON.stringify({
    taskId,
    sourceType: "twitter",
    sources: normalized
  });
  return createHash("sha256").update(material).digest("hex");
};

export const enqueueTwitterBrowserJobPg = async (
  db: AppDbClient,
  taskId: string,
  maxAttempts = 3
): Promise<EnqueueTwitterBrowserJobResult> => {
  const task = await db.one<{ id: string }>(`SELECT id FROM analysis_tasks WHERE id = $1`, [taskId]);
  if (!task) {
    throw new Error("task_not_found");
  }

  const dedupeKey = await buildTwitterBrowserDedupeKey(db, taskId);

  const existing = await db.one<{ id: string; status: TwitterBrowserJobStatus }>(
    `SELECT id, status
     FROM worker_jobs
     WHERE dedupe_key = $1
       AND job_type = 'twitter_browser_fetch'
       AND status IN ('queued', 'running')
     ORDER BY created_at DESC
     LIMIT 1`,
    [dedupeKey]
  );

  if (existing) {
    return {
      jobId: existing.id,
      status: existing.status,
      deduped: true
    };
  }

  const jobId = randomUUID();
  const now = nowIso();
  try {
    await db.execute(
      `INSERT INTO worker_jobs (
        id, job_type, task_id, status, payload_json, result_json, error_message,
        attempts, max_attempts, run_after, next_retry_at, last_error_code, dedupe_key,
        locked_at, lock_owner, created_at, updated_at, finished_at
      ) VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7, $8, NULL, NULL, $9, NULL, NULL, $10, $11, NULL)`,
      [jobId, "twitter_browser_fetch", taskId, "queued", JSON.stringify({ taskId }), 0, maxAttempts, now, dedupeKey, now, now]
    );
  } catch (error) {
    const duplicate = await db.one<{ id: string; status: TwitterBrowserJobStatus }>(
      `SELECT id, status
       FROM worker_jobs
       WHERE dedupe_key = $1
         AND job_type = 'twitter_browser_fetch'
         AND status IN ('queued', 'running')
       ORDER BY created_at DESC
       LIMIT 1`,
      [dedupeKey]
    );
    if (duplicate) {
      return {
        jobId: duplicate.id,
        status: duplicate.status,
        deduped: true
      };
    }
    throw error;
  }

  return {
    jobId,
    status: "queued",
    deduped: false
  };
};

export const claimNextTwitterBrowserJobPg = async (
  db: AppDbClient,
  workerId: string
): Promise<ClaimedTwitterBrowserJob | null> =>
  db.transaction(async (tx) => {
    const now = nowIso();
    const row = await tx.one<{ id: string; task_id: string; attempts: number; max_attempts: number; dedupe_key: string | null }>(
      `SELECT id, task_id, attempts, max_attempts, dedupe_key
       FROM worker_jobs
       WHERE job_type = 'twitter_browser_fetch'
         AND status = 'queued'
         AND attempts < max_attempts
         AND run_after <= $1
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [now]
    );

    if (!row) {
      return null;
    }

    await tx.execute(
      `UPDATE worker_jobs
       SET status = 'running',
           attempts = attempts + 1,
           locked_at = $1,
           lock_owner = $2,
           next_retry_at = NULL,
           updated_at = $3
       WHERE id = $4`,
      [now, workerId, now, row.id]
    );

    return {
      jobId: row.id,
      taskId: row.task_id,
      dedupeKey: row.dedupe_key ?? null,
      attempts: row.attempts + 1,
      maxAttempts: row.max_attempts
    };
  });

export const completeTwitterBrowserJobPg = async (db: AppDbClient, jobId: string, result: unknown) => {
  const now = nowIso();
  await db.execute(
    `UPDATE worker_jobs
     SET status = 'completed',
         result_json = $1,
         error_message = NULL,
         last_error_code = NULL,
         next_retry_at = NULL,
         run_after = $2,
         locked_at = NULL,
         lock_owner = NULL,
         finished_at = $2,
         updated_at = $3
     WHERE id = $4`,
    [JSON.stringify(result), now, now, jobId]
  );
};

export const failTwitterBrowserJobPg = async (
  db: AppDbClient,
  jobId: string,
  errorMessage: string,
  nextAttempts: number,
  maxAttempts: number
) => {
  const now = nowIso();
  const shouldRetry = nextAttempts < maxAttempts;
  const retryDelayMs = RETRY_BACKOFF_MS[Math.max(0, Math.min(nextAttempts - 1, RETRY_BACKOFF_MS.length - 1))];
  const nextRunAfter = new Date(Date.now() + retryDelayMs).toISOString();
  const errorCode = classifyJobErrorCode(errorMessage);

  await db.execute(
    `UPDATE worker_jobs
     SET status = $1,
         error_message = $2,
         last_error_code = $3,
         run_after = $4,
         next_retry_at = $5,
         finished_at = $6,
         updated_at = $7,
         locked_at = NULL,
         lock_owner = NULL
     WHERE id = $8`,
    [
      shouldRetry ? "queued" : "dead_letter",
      errorMessage,
      errorCode,
      shouldRetry ? nextRunAfter : now,
      shouldRetry ? nextRunAfter : null,
      shouldRetry ? null : now,
      now,
      jobId
    ]
  );
};
