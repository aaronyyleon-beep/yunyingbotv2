import type { DatabaseSync } from "node:sqlite";

export const getTaskSnapshot = (db: DatabaseSync, taskId: string) => {
  const task = db.prepare(`SELECT * FROM analysis_tasks WHERE id = ?`).get(taskId);
  const project = db
    .prepare(
      `SELECT p.* FROM projects p
       JOIN analysis_tasks t ON t.project_id = p.id
       WHERE t.id = ?`
    )
    .get(taskId);
  const inputs = db.prepare(`SELECT * FROM task_inputs WHERE task_id = ? ORDER BY created_at ASC`).all(taskId);
  const sources = db.prepare(`SELECT * FROM sources WHERE task_id = ? ORDER BY created_at ASC`).all(taskId);
  const evidences = db.prepare(`SELECT * FROM evidences WHERE task_id = ? ORDER BY created_at ASC`).all(taskId);
  const factors = db.prepare(`SELECT * FROM factors WHERE task_id = ? ORDER BY dimension_name, factor_name`).all(taskId);
  const dimensions = db.prepare(`SELECT * FROM dimensions WHERE task_id = ? ORDER BY dimension_name`).all(taskId);
  const report = db.prepare(`SELECT * FROM reports WHERE task_id = ?`).get(taskId);
  const reviews = db.prepare(`SELECT * FROM review_records WHERE task_id = ? ORDER BY created_at ASC`).all(taskId);
  const versions = db.prepare(`SELECT id, version_type, created_at FROM report_versions WHERE task_id = ? ORDER BY created_at ASC`).all(taskId);

  return {
    task,
    project,
    report,
    summary: {
      inputCount: inputs.length,
      sourceCount: sources.length,
      evidenceCount: evidences.length,
      factorCount: factors.length,
      dimensionCount: dimensions.length,
      reviewCount: reviews.length,
      versionCount: versions.length
    },
    inputs,
    sources,
    evidences,
    factors,
    dimensions,
    reviews,
    versions
  };
};
