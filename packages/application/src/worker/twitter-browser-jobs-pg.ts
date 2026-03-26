import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

export type TwitterBrowserJobStatus = "queued" | "running" | "completed" | "failed";

export interface EnqueueTwitterBrowserJobResult {
  jobId: string;
  status: TwitterBrowserJobStatus;
  deduped: boolean;
}

export interface ClaimedTwitterBrowserJob {
  jobId: string;
  taskId: string;
  attempts: number;
  maxAttempts: number;
}

const nowIso = () => new Date().toISOString();

export const enqueueTwitterBrowserJobPg = async (
  db: AppDbClient,
  taskId: string,
  maxAttempts = 3
): Promise<EnqueueTwitterBrowserJobResult> => {
  const task = await db.one<{ id: string }>(`SELECT id FROM analysis_tasks WHERE id = $1`, [taskId]);
  if (!task) {
    throw new Error("task_not_found");
  }

  const existing = await db.one<{ id: string; status: TwitterBrowserJobStatus }>(
    `SELECT id, status
     FROM worker_jobs
     WHERE task_id = $1
       AND job_type = 'twitter_browser_fetch'
       AND status IN ('queued', 'running')
     ORDER BY created_at DESC
     LIMIT 1`,
    [taskId]
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
  await db.execute(
    `INSERT INTO worker_jobs (
      id, job_type, task_id, status, payload_json, result_json, error_message,
      attempts, max_attempts, run_after, locked_at, lock_owner, created_at, updated_at, finished_at
    ) VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7, $8, NULL, NULL, $9, $10, NULL)`,
    [jobId, "twitter_browser_fetch", taskId, "queued", JSON.stringify({ taskId }), 0, maxAttempts, now, now, now]
  );

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
    const row = await tx.one<{ id: string; task_id: string; attempts: number; max_attempts: number }>(
      `SELECT id, task_id, attempts, max_attempts
       FROM worker_jobs
       WHERE job_type = 'twitter_browser_fetch'
         AND status = 'queued'
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
           updated_at = $3
       WHERE id = $4`,
      [now, workerId, now, row.id]
    );

    return {
      jobId: row.id,
      taskId: row.task_id,
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
  maxAttempts: number,
  retryDelayMs = 20_000
) => {
  const now = nowIso();
  const shouldRetry = nextAttempts < maxAttempts;
  const nextRunAfter = new Date(Date.now() + retryDelayMs).toISOString();

  await db.execute(
    `UPDATE worker_jobs
     SET status = $1,
         error_message = $2,
         run_after = $3,
         finished_at = $4,
         updated_at = $5,
         locked_at = NULL,
         lock_owner = NULL
     WHERE id = $6`,
    [shouldRetry ? "queued" : "failed", errorMessage, shouldRetry ? nextRunAfter : now, shouldRetry ? null : now, now, jobId]
  );
};
