import type { DatabaseSync } from "node:sqlite";

export const getReportVersions = (db: DatabaseSync, taskId: string) => {
  return db
    .prepare(
      `SELECT id, version_type, created_at
       FROM report_versions
       WHERE task_id = ?
       ORDER BY created_at DESC`
    )
    .all(taskId);
};
