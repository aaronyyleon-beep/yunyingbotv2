import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

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

export const recordCollectionRun = (db: DatabaseSync, input: RecordCollectionRunInput) => {
  db.prepare(
    `INSERT INTO collection_runs (
      id, task_id, collector_key, source_type, status, collected_count, skipped_count, evidence_count, warnings_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
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
  );
};
