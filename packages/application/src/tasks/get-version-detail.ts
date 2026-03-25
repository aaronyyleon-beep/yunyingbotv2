import type { DatabaseSync } from "node:sqlite";
import { parseJsonObject } from "./parse-json.js";

export const getVersionDetail = (db: DatabaseSync, taskId: string, versionId: string) => {
  const row =
    db
      .prepare(
        `SELECT id, version_type, factor_snapshot_json, dimension_snapshot_json, report_snapshot_json, created_at
         FROM report_versions
         WHERE task_id = ? AND id = ?`
      )
      .get(taskId, versionId) ?? null;

  if (!row) {
    return null;
  }

  const record = row as {
    id: string;
    version_type: string;
    factor_snapshot_json: string;
    dimension_snapshot_json: string;
    report_snapshot_json: string;
    created_at: string;
  };

  return {
    id: record.id,
    version_type: record.version_type,
    created_at: record.created_at,
    factor_snapshot: parseJsonObject<unknown[]>(record.factor_snapshot_json) ?? [],
    dimension_snapshot: parseJsonObject<unknown[]>(record.dimension_snapshot_json) ?? [],
    report_snapshot: parseJsonObject<Record<string, unknown>>(record.report_snapshot_json) ?? null
  };
};
