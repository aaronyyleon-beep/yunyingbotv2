import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

const nowIso = () => new Date().toISOString();

interface RecordCollectionRunInput {
  taskId: string;
  collectorKey: string;
  sourceType: string;
  status: "completed" | "partial" | "failed";
  collectedCount: number;
  skippedCount: number;
  evidenceCount: number;
  warnings: string[];
}

export const recordCollectionRunPg = async (db: AppDbClient, input: RecordCollectionRunInput) => {
  await db.execute(
    `INSERT INTO collection_runs (
      id, task_id, collector_key, source_type, status, collected_count, skipped_count, evidence_count, warnings_json, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      randomUUID(),
      input.taskId,
      input.collectorKey,
      input.sourceType,
      input.status,
      input.collectedCount,
      input.skippedCount,
      input.evidenceCount,
      JSON.stringify(input.warnings),
      nowIso()
    ]
  );
};
