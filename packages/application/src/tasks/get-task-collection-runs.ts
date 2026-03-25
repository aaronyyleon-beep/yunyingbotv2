import type { DatabaseSync } from "node:sqlite";
import { parseJsonArray } from "./parse-json.js";

export const getTaskCollectionRuns = (db: DatabaseSync, taskId: string) => {
  const rows = db
    .prepare(
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
      WHERE task_id = ?
      ORDER BY created_at DESC`
    )
    .all(taskId) as Array<{
    id: string;
    collector_key: string;
    source_type: string;
    status: string;
    collected_count: number;
    skipped_count: number;
    evidence_count: number;
    warnings_json: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    collector_key: row.collector_key,
    source_type: row.source_type,
    status: row.status,
    collected_count: row.collected_count,
    skipped_count: row.skipped_count,
    evidence_count: row.evidence_count,
    created_at: row.created_at,
    warnings: parseJsonArray(row.warnings_json)
  }));
};
