import type { AppDbClient } from "../db/client.js";

const nowIso = () => new Date().toISOString();

const isFreshRun = (status: "completed" | "partial" | "failed", evidenceCount: number) =>
  evidenceCount > 0 && (status === "completed" || status === "partial");

export const applyCollectionHardGate = async (
  db: AppDbClient,
  input: {
    taskId: string;
    sourceTypes: string[];
    status: "completed" | "partial" | "failed";
    evidenceCount: number;
  }
) => {
  const now = nowIso();
  const freshEvidenceReady = isFreshRun(input.status, input.evidenceCount);

  await db.execute(
    `UPDATE analysis_tasks
     SET collection_status = $1,
         fresh_evidence_ready = CASE WHEN $2 THEN TRUE ELSE fresh_evidence_ready END,
         updated_at = $3
     WHERE id = $4`,
    [freshEvidenceReady ? "evidence_ready" : "collecting", freshEvidenceReady, now, input.taskId]
  );

  if (input.sourceTypes.length > 0) {
    const uniqueSourceTypes = Array.from(new Set(input.sourceTypes));
    await db.execute(
      `UPDATE sources s
       SET last_collected_at = $1,
           last_evidence_count = COALESCE((
             SELECT COUNT(*)::int
             FROM evidences e
             WHERE e.task_id = s.task_id
               AND e.source_id = s.id
           ), 0)
       WHERE s.task_id = $2
         AND s.source_type = ANY($3::text[])`,
      [now, input.taskId, uniqueSourceTypes]
    );
  }

  return {
    taskId: input.taskId,
    collectionStatus: freshEvidenceReady ? "evidence_ready" : "collecting",
    freshEvidenceReady,
    updatedAt: now
  };
};

export const clearFreshEvidenceGateAfterAnalysis = async (db: AppDbClient, taskId: string) => {
  const now = nowIso();
  await db.execute(
    `UPDATE analysis_tasks
     SET fresh_evidence_ready = false,
         updated_at = $1
     WHERE id = $2`,
    [now, taskId]
  );
  return { taskId, freshEvidenceReady: false, updatedAt: now };
};
