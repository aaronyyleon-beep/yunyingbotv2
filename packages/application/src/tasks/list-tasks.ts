import type { DatabaseSync } from "node:sqlite";

export const listTasks = (db: DatabaseSync) => {
  return db
    .prepare(
      `SELECT
        t.id,
        t.task_status,
        t.collection_status,
        t.analysis_status,
        t.review_status,
        t.final_status,
        t.created_at,
        t.updated_at,
        p.id AS project_id,
        p.name AS project_name,
        r.final_score,
        r.risk_level
      FROM analysis_tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN reports r ON r.task_id = t.id
      ORDER BY t.created_at DESC`
    )
    .all() as Array<{
    id: string;
    task_status: string;
    collection_status: string;
    analysis_status: string;
    review_status: string;
    final_status: string;
    created_at: string;
    updated_at: string;
    project_id: string;
    project_name: string;
    final_score: number | null;
    risk_level: string | null;
  }>;
};
