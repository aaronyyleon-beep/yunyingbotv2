import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createVersionSnapshot } from "./create-version-snapshot.js";
import { recalculateTask } from "./recalculate-task.js";

const nowIso = () => new Date().toISOString();

interface ReviewFactorInput {
  taskId: string;
  factorId: string;
  reviewer: string;
  overrideScore: number;
  factSupplement?: string;
  overrideReason: string;
}

export const reviewFactor = (db: DatabaseSync, input: ReviewFactorInput) => {
  const factor = db
    .prepare(`SELECT * FROM factors WHERE id = ? AND task_id = ?`)
    .get(input.factorId, input.taskId) as
    | {
        id: string;
        ai_score: number | null;
        final_score: number | null;
        status: string;
      }
    | undefined;

  if (!factor) {
    throw new Error("factor_not_found");
  }

  const now = nowIso();
  db.prepare(
    `INSERT INTO review_records (
      id, task_id, factor_id, reviewer, old_ai_score, old_final_score, override_score, new_final_score,
      fact_supplement, override_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    input.taskId,
    input.factorId,
    input.reviewer,
    factor.ai_score,
    factor.final_score,
    input.overrideScore,
    input.overrideScore,
    input.factSupplement ?? null,
    input.overrideReason,
    now
  );

  db.prepare(
    `UPDATE factors
     SET final_score = ?, status = ?, score_reason = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.overrideScore,
    "overridden",
    `Human override applied by ${input.reviewer}. Reason: ${input.overrideReason}`,
    now,
    input.factorId
  );

  const recalculation = recalculateTask(db, input.taskId);
  const version = createVersionSnapshot(db, input.taskId, "human_revised");

  return {
    taskId: input.taskId,
    factorId: input.factorId,
    finalScore: input.overrideScore,
    recalculation,
    version
  };
};
