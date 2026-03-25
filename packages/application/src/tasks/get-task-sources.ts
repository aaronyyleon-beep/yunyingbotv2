import type { DatabaseSync } from "node:sqlite";

export const getTaskSources = (db: DatabaseSync, taskId: string) => {
  return db
    .prepare(
      `SELECT
        s.id,
        s.source_type,
        s.source_url,
        s.is_official,
        s.access_status,
        c.requested_window_hours,
        c.effective_window_hours,
        c.history_access_mode,
        c.bot_access_status,
        c.target_label,
        c.target_kind,
        o.chain_key,
        o.chain_label,
        o.contract_role_hint,
        s.created_at,
        s.updated_at,
        COUNT(e.id) AS evidence_count
      FROM sources s
      LEFT JOIN community_source_contexts c ON c.source_id = s.id
      LEFT JOIN onchain_source_contexts o ON o.source_id = s.id
      LEFT JOIN evidences e ON e.source_id = s.id
      WHERE s.task_id = ?
      GROUP BY s.id
      ORDER BY s.created_at ASC`
    )
    .all(taskId) as Array<{
    id: string;
    source_type: string;
    source_url: string;
    is_official: number;
    access_status: string;
    requested_window_hours: number | null;
    effective_window_hours: number | null;
    history_access_mode: string | null;
    bot_access_status: string | null;
    target_label: string | null;
    target_kind: string | null;
    chain_key: string | null;
    chain_label: string | null;
    contract_role_hint: string | null;
    created_at: string;
    updated_at: string;
    evidence_count: number;
  }>;
};
