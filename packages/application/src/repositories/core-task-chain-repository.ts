import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";
import type { TaskInputPayload } from "@yunyingbot/shared";

const nowIso = () => new Date().toISOString();

const normalizeValue = (value: string) => value.trim();

export interface TaskSummaryRow {
  [key: string]: unknown;
  id: string;
  task_status: string;
  collection_status: string;
  analysis_status: string;
  fresh_evidence_ready: boolean;
  project_name: string;
  final_score: number | null;
  review_status: string;
  risk_level: string | null;
}

export interface TaskSourceRow extends DbRowLike {
  id: string;
  source_type: string;
  source_url: string;
  is_official: boolean;
  access_status: string;
  requested_window_hours: number | null;
  effective_window_hours: number | null;
  history_access_mode: string | null;
  bot_access_status: string | null;
  target_label: string | null;
  target_kind: string | null;
  chain_key: string | null;
  chain_label: string | null;
  contract_role_hint: string | null;
  last_collected_at: string | null;
  last_evidence_count: number;
  created_at: string;
  updated_at: string;
  evidence_count: number;
}

export interface CollectionRunRow extends DbRowLike {
  id: string;
  collector_key: string;
  source_type: string;
  status: string;
  collected_count: number;
  skipped_count: number;
  evidence_count: number;
  warnings_json: string;
  created_at: string;
}

export interface TaskSnapshotRow extends DbRowLike {
  task_id: string;
  task_status: string;
  collection_status: string;
  analysis_status: string;
  fresh_evidence_ready: boolean;
  review_status: string;
  final_status: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  project_name: string;
  official_website: string | null;
  official_twitter: string | null;
}

interface DbRowLike {
  [key: string]: unknown;
}

export const findRecentTaskByProjectName = async (
  db: AppDbClient,
  projectName: string,
  windowMinutes: number
) => {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  return db.one<{ task_id: string; created_at: string }>(
    `SELECT t.id AS task_id, t.created_at
     FROM analysis_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE lower(trim(p.name)) = $1
       AND t.created_at >= $2
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [projectName.toLowerCase(), cutoff]
  );
};

export const createProject = async (
  db: AppDbClient,
  input: { id?: string; name: string; officialWebsite?: string | null; officialTwitter?: string | null }
) => {
  const now = nowIso();
  const id = input.id ?? randomUUID();
  await db.execute(
    `INSERT INTO projects (id, name, official_website, official_twitter, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.name, input.officialWebsite ?? null, input.officialTwitter ?? null, now, now]
  );
  return { id, createdAt: now };
};

export const createAnalysisTaskRecord = async (db: AppDbClient, projectId: string, inputs: TaskInputPayload[]) => {
  const taskId = randomUUID();
  const now = nowIso();

  await db.transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO analysis_tasks (
        id, project_id, task_status, collection_status, analysis_status, review_status, final_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [taskId, projectId, "created", "pending", "pending", "not_started", "draft", now, now]
    );

    for (const input of inputs) {
      await tx.execute(
        `INSERT INTO task_inputs (id, task_id, input_type, raw_value, normalized_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), taskId, input.type, input.value, normalizeValue(input.value), now]
      );
    }
  });

  return { taskId, createdAt: now };
};

export const insertTaskInputRecord = async (
  db: AppDbClient,
  input: {
    taskId: string;
    inputType: TaskInputPayload["type"];
    rawValue: string;
    normalizedValue?: string;
  }
) => {
  const createdAt = nowIso();
  const id = randomUUID();
  await db.execute(
    `INSERT INTO task_inputs (id, task_id, input_type, raw_value, normalized_value, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.taskId, input.inputType, input.rawValue, input.normalizedValue ?? normalizeValue(input.rawValue), createdAt]
  );
  return { id, createdAt };
};

export const insertSourceRecord = async (
  db: AppDbClient,
  input: {
    id?: string;
    projectId: string;
    taskId: string;
    sourceType: string;
    sourceUrl: string;
    isOfficial: boolean;
    accessStatus: string;
  }
) => {
  const now = nowIso();
  const id = input.id ?? randomUUID();
  await db.execute(
    `INSERT INTO sources (
      id, project_id, task_id, source_type, source_url, is_official, access_status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.projectId, input.taskId, input.sourceType, input.sourceUrl, input.isOfficial, input.accessStatus, now, now]
  );
  return { id, createdAt: now };
};

export const insertEvidenceRecord = async (
  db: AppDbClient,
  input: {
    id?: string;
    taskId: string;
    sourceId: string;
    evidenceType: string;
    title?: string | null;
    summary?: string | null;
    rawContent?: string | null;
    credibilityLevel: string;
    capturedAt?: string;
  }
) => {
  const createdAt = nowIso();
  const capturedAt = input.capturedAt ?? createdAt;
  const id = input.id ?? randomUUID();
  await db.execute(
    `INSERT INTO evidences (
      id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.taskId,
      input.sourceId,
      input.evidenceType,
      input.title ?? null,
      input.summary ?? null,
      input.rawContent ?? null,
      input.credibilityLevel,
      capturedAt,
      createdAt
    ]
  );
  return { id, createdAt, capturedAt };
};

export const enqueueWorkerJobRecord = async (
  db: AppDbClient,
  input: { taskId: string; jobType: string; payloadJson?: string | null; maxAttempts?: number }
) => {
  const now = nowIso();
  const id = randomUUID();
  await db.execute(
    `INSERT INTO worker_jobs (
      id, job_type, task_id, status, payload_json, result_json, error_message,
      attempts, max_attempts, run_after, locked_at, lock_owner, created_at, updated_at, finished_at
    ) VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7, $8, NULL, NULL, $9, $10, NULL)`,
    [
      id,
      input.jobType,
      input.taskId,
      "queued",
      input.payloadJson ?? null,
      0,
      input.maxAttempts ?? 3,
      now,
      now,
      now
    ]
  );
  return { id, createdAt: now };
};

export const listTaskSummaries = async (db: AppDbClient): Promise<TaskSummaryRow[]> =>
  db.query<TaskSummaryRow>(
    `SELECT
       t.id,
       t.task_status,
       t.collection_status,
       t.analysis_status,
       t.fresh_evidence_ready,
       p.name AS project_name,
       r.final_score,
       t.review_status,
       r.risk_level
     FROM analysis_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN reports r ON r.task_id = t.id
     ORDER BY t.created_at DESC`
  );

export const updateProjectIdentity = async (
  db: AppDbClient,
  input: {
    projectId: string;
    name: string;
    officialWebsite?: string | null;
    officialTwitter?: string | null;
  }
) => {
  const now = nowIso();
  await db.execute(
    `UPDATE projects
     SET name = $1,
         official_website = $2,
         official_twitter = $3,
         updated_at = $4
     WHERE id = $5`,
    [input.name, input.officialWebsite ?? null, input.officialTwitter ?? null, now, input.projectId]
  );
  return { updatedAt: now };
};

export const insertCommunitySourceContextRecord = async (
  db: AppDbClient,
  input: {
    taskId: string;
    sourceId: string;
    platform: string;
    targetLabel?: string | null;
    targetKind?: string | null;
    requestedWindowHours: number;
    effectiveWindowHours?: number | null;
    historyAccessMode: string;
    botAccessStatus: string;
  }
) => {
  const now = nowIso();
  await db.execute(
    `INSERT INTO community_source_contexts (
      id, task_id, source_id, platform, target_label, target_kind,
      requested_window_hours, effective_window_hours, history_access_mode, bot_access_status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      randomUUID(),
      input.taskId,
      input.sourceId,
      input.platform,
      input.targetLabel ?? null,
      input.targetKind ?? null,
      input.requestedWindowHours,
      input.effectiveWindowHours ?? null,
      input.historyAccessMode,
      input.botAccessStatus,
      now,
      now
    ]
  );
  return { createdAt: now };
};

export const insertOnchainSourceContextRecord = async (
  db: AppDbClient,
  input: {
    taskId: string;
    sourceId: string;
    chainKey: string;
    chainLabel: string;
    contractRoleHint?: string | null;
  }
) => {
  const now = nowIso();
  await db.execute(
    `INSERT INTO onchain_source_contexts (
      id, task_id, source_id, chain_key, chain_label, contract_role_hint, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), input.taskId, input.sourceId, input.chainKey, input.chainLabel, input.contractRoleHint ?? null, now, now]
  );
  return { createdAt: now };
};

export const updateTaskStatuses = async (
  db: AppDbClient,
  input: {
    taskId: string;
    taskStatus?: string;
    collectionStatus?: string;
    analysisStatus?: string;
    reviewStatus?: string;
    finalStatus?: string;
  }
) => {
  const fields = [
    input.taskStatus ? { sql: "task_status", value: input.taskStatus } : null,
    input.collectionStatus ? { sql: "collection_status", value: input.collectionStatus } : null,
    input.analysisStatus ? { sql: "analysis_status", value: input.analysisStatus } : null,
    input.reviewStatus ? { sql: "review_status", value: input.reviewStatus } : null,
    input.finalStatus ? { sql: "final_status", value: input.finalStatus } : null
  ].filter(Boolean) as Array<{ sql: string; value: string }>;

  if (fields.length === 0) {
    return { updatedAt: nowIso() };
  }

  const now = nowIso();
  const assignments = fields.map((field, index) => `${field.sql} = $${index + 1}`);
  assignments.push(`updated_at = $${fields.length + 1}`);

  await db.execute(
    `UPDATE analysis_tasks
     SET ${assignments.join(", ")}
     WHERE id = $${fields.length + 2}`,
    [...fields.map((field) => field.value), now, input.taskId]
  );
  return { updatedAt: now };
};

export const getTaskSnapshotCore = async (db: AppDbClient, taskId: string) => {
  const snapshot = await db.one<TaskSnapshotRow>(
    `SELECT
       t.id AS task_id,
       t.task_status,
       t.collection_status,
       t.analysis_status,
       t.fresh_evidence_ready,
       t.review_status,
       t.final_status,
       t.created_at,
       t.updated_at,
       p.id AS project_id,
       p.name AS project_name,
       p.official_website,
       p.official_twitter
     FROM analysis_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1`,
    [taskId]
  );

  if (!snapshot) {
    return null;
  }

  const [inputCounts, sourceCounts, evidenceCounts, report] = await Promise.all([
    db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM task_inputs WHERE task_id = $1`, [taskId]),
    db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM sources WHERE task_id = $1`, [taskId]),
    db.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM evidences WHERE task_id = $1`, [taskId]),
    db.one<{ final_score: number; risk_level: string; summary: string; data_quality_note: string }>(
      `SELECT final_score, risk_level, summary, data_quality_note FROM reports WHERE task_id = $1`,
      [taskId]
    )
  ]);

  return {
    task: {
      id: snapshot.task_id,
      project_id: snapshot.project_id,
      task_status: snapshot.task_status,
      collection_status: snapshot.collection_status,
      analysis_status: snapshot.analysis_status,
      fresh_evidence_ready: snapshot.fresh_evidence_ready,
      review_status: snapshot.review_status,
      final_status: snapshot.final_status,
      created_at: snapshot.created_at,
      updated_at: snapshot.updated_at
    },
    project: {
      id: snapshot.project_id,
      name: snapshot.project_name,
      official_website: snapshot.official_website,
      official_twitter: snapshot.official_twitter
    },
    report,
    summary: {
      inputCount: inputCounts?.count ?? 0,
      sourceCount: sourceCounts?.count ?? 0,
      evidenceCount: evidenceCounts?.count ?? 0,
      factorCount: 0,
      dimensionCount: 0,
      reviewCount: 0,
      versionCount: 0
    },
    inputs: [],
    sources: [],
    evidences: [],
    factors: [],
    dimensions: [],
    reviews: [],
    versions: []
  };
};

export const listTaskSourcesByTaskId = async (db: AppDbClient, taskId: string): Promise<TaskSourceRow[]> =>
  db.query<TaskSourceRow>(
    `SELECT
       s.id,
       s.source_type,
       s.source_url,
       s.is_official,
       s.access_status,
       c.requested_window_hours,
       c.effective_window_hours,
       c.history_access_mode,
       c.bot_access_status,
       c.target_label,
       c.target_kind,
       o.chain_key,
       o.chain_label,
       o.contract_role_hint,
       s.last_collected_at,
       s.last_evidence_count,
       s.created_at,
       s.updated_at,
       COUNT(e.id)::int AS evidence_count
     FROM sources s
     LEFT JOIN community_source_contexts c ON c.source_id = s.id
     LEFT JOIN onchain_source_contexts o ON o.source_id = s.id
     LEFT JOIN evidences e ON e.source_id = s.id
     WHERE s.task_id = $1
     GROUP BY
       s.id, c.requested_window_hours, c.effective_window_hours, c.history_access_mode,
       c.bot_access_status, c.target_label, c.target_kind, o.chain_key, o.chain_label, o.contract_role_hint
     ORDER BY s.created_at ASC`,
    [taskId]
  );

export const listCollectionRunsByTaskId = async (db: AppDbClient, taskId: string): Promise<CollectionRunRow[]> =>
  db.query<CollectionRunRow>(
    `SELECT
       id,
       collector_key,
       source_type,
       status,
       collected_count,
       skipped_count,
       evidence_count,
       warnings_json,
       created_at
     FROM collection_runs
     WHERE task_id = $1
     ORDER BY created_at DESC`,
    [taskId]
  );
