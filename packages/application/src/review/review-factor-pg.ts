import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";
import { createVersionSnapshotPg } from "./create-version-snapshot-pg.js";
import { recalculateTaskPg } from "./recalculate-task-pg.js";

const nowIso = () => new Date().toISOString();

interface ReviewFactorInput {
  taskId: string;
  factorId: string;
  reviewer: string;
  overrideScore: number;
  factSupplement?: string;
  overrideReason: string;
}

export const reviewFactorPg = async (db: AppDbClient, input: ReviewFactorInput) => {
  const factor = await db.one<{
    id: string;
    ai_score: number | null;
    final_score: number | null;
    status: string;
  }>(`SELECT * FROM factors WHERE id = $1 AND task_id = $2`, [input.factorId, input.taskId]);

  if (!factor) {
    throw new Error("factor_not_found");
  }

  const now = nowIso();
  await db.execute(
    `INSERT INTO review_records (
      id, task_id, factor_id, reviewer, old_ai_score, old_final_score, override_score, new_final_score,
      fact_supplement, override_reason, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
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
    ]
  );

  await db.execute(
    `UPDATE factors
     SET final_score = $1, status = $2, score_reason = $3, updated_at = $4
     WHERE id = $5`,
    [input.overrideScore, "overridden", `Human override applied by ${input.reviewer}. Reason: ${input.overrideReason}`, now, input.factorId]
  );

  const recalculation = await recalculateTaskPg(db, input.taskId);
  const version = await createVersionSnapshotPg(db, input.taskId, "human_revised");

  return {
    taskId: input.taskId,
    factorId: input.factorId,
    finalScore: input.overrideScore,
    recalculation,
    version
  };
};
