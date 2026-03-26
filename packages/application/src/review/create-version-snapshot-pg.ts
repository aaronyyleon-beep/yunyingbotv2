import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

const nowIso = () => new Date().toISOString();

export const createVersionSnapshotPg = async (
  db: AppDbClient,
  taskId: string,
  versionType: "ai_initial" | "human_revised" | "final_confirmed"
) => {
  const [factors, dimensions, report] = await Promise.all([
    db.query(`SELECT * FROM factors WHERE task_id = $1 ORDER BY dimension_name, factor_name`, [taskId]),
    db.query(`SELECT * FROM dimensions WHERE task_id = $1 ORDER BY dimension_name`, [taskId]),
    db.one(`SELECT * FROM reports WHERE task_id = $1`, [taskId])
  ]);

  const versionId = randomUUID();
  await db.execute(
    `INSERT INTO report_versions (
      id, task_id, version_type, factor_snapshot_json, dimension_snapshot_json, report_snapshot_json, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [versionId, taskId, versionType, JSON.stringify(factors), JSON.stringify(dimensions), JSON.stringify(report), nowIso()]
  );

  return {
    versionId,
    taskId,
    versionType
  };
};
