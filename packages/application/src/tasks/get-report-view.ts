import type { DatabaseSync } from "node:sqlite";

export const getReportView = (db: DatabaseSync, taskId: string) => {
  const report = db.prepare(`SELECT * FROM reports WHERE task_id = ?`).get(taskId);
  if (!report) {
    return null;
  }

  const dimensions = db
    .prepare(`SELECT dimension_key, dimension_name, final_score, summary FROM dimensions WHERE task_id = ? ORDER BY dimension_name`)
    .all(taskId);

  return {
    report,
    dimensions
  };
};
