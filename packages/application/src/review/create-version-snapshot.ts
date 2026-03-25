import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const nowIso = () => new Date().toISOString();

export const createVersionSnapshot = (
  db: DatabaseSync,
  taskId: string,
  versionType: "ai_initial" | "human_revised" | "final_confirmed"
) => {
  const factors = db.prepare(`SELECT * FROM factors WHERE task_id = ? ORDER BY dimension_name, factor_name`).all(taskId);
  const dimensions = db.prepare(`SELECT * FROM dimensions WHERE task_id = ? ORDER BY dimension_name`).all(taskId);
  const report = db.prepare(`SELECT * FROM reports WHERE task_id = ?`).get(taskId);
  const versionId = randomUUID();
  const now = nowIso();

  db.prepare(
    `INSERT INTO report_versions (
      id, task_id, version_type, factor_snapshot_json, dimension_snapshot_json, report_snapshot_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(versionId, taskId, versionType, JSON.stringify(factors), JSON.stringify(dimensions), JSON.stringify(report), now);

  return {
    versionId,
    taskId,
    versionType
  };
};
