import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";
import { updateTaskStatuses } from "../repositories/core-task-chain-repository.js";

const nowIso = () => new Date().toISOString();
const clampScore = (score: number): number => Math.max(1, Math.min(10, Number(score.toFixed(1))));

const mapRiskLevel = (finalScore: number): "high" | "medium" | "low" => {
  if (finalScore < 4) return "high";
  if (finalScore < 7) return "medium";
  return "low";
};

export const recalculateTaskPg = async (db: AppDbClient, taskId: string) => {
  const factors = await db.query<{
    dimension_key: string;
    dimension_name: string;
    final_score: number;
    status: string;
  }>(`SELECT dimension_key, dimension_name, final_score, status FROM factors WHERE task_id = $1`, [taskId]);

  const dimensionBuckets = new Map<string, { name: string; scores: number[]; insufficientCount: number }>();
  for (const factor of factors) {
    const bucket = dimensionBuckets.get(factor.dimension_key) ?? {
      name: factor.dimension_name,
      scores: [],
      insufficientCount: 0
    };
    bucket.scores.push(Number(factor.final_score ?? 1));
    if (factor.status === "insufficient_evidence") {
      bucket.insufficientCount += 1;
    }
    dimensionBuckets.set(factor.dimension_key, bucket);
  }

  const now = nowIso();
  await db.execute(`DELETE FROM dimensions WHERE task_id = $1`, [taskId]);

  const dimensionRows = [];
  for (const [dimensionKey, bucket] of dimensionBuckets.entries()) {
    const finalScore = clampScore(bucket.scores.reduce((sum, current) => sum + current, 0) / Math.max(1, bucket.scores.length));
    const summary =
      bucket.insufficientCount > 0
        ? `Dimension recalculated from ${bucket.scores.length} factors, including ${bucket.insufficientCount} insufficient factors.`
        : `Dimension recalculated from ${bucket.scores.length} reviewed factors.`;

    await db.execute(
      `INSERT INTO dimensions (
        id, task_id, dimension_key, dimension_name, final_score, summary, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), taskId, dimensionKey, bucket.name, finalScore, summary, now, now]
    );

    dimensionRows.push({
      dimensionKey,
      dimensionName: bucket.name,
      finalScore
    });
  }

  const reportFinalScore = clampScore(
    dimensionRows.reduce((sum, current) => sum + current.finalScore, 0) / Math.max(1, dimensionRows.length)
  );
  const insufficientCount = factors.filter((factor) => factor.status === "insufficient_evidence").length;
  const riskLevel = mapRiskLevel(reportFinalScore);
  const summary = `Report recalculated from ${dimensionRows.length} dimensions with aggregate score ${reportFinalScore}.`;
  const dataQualityNote =
    insufficientCount > 0
      ? `${insufficientCount} factors remain insufficient_evidence after recalculation.`
      : "All factors currently have reviewable scores.";

  await db.execute(
    `UPDATE reports
     SET final_score = $1, risk_level = $2, summary = $3, data_quality_note = $4, updated_at = $5
     WHERE task_id = $6`,
    [reportFinalScore, riskLevel, summary, dataQualityNote, now, taskId]
  );

  await updateTaskStatuses(db, {
    taskId,
    taskStatus: "completed",
    reviewStatus: "revised"
  });

  return {
    taskId,
    finalScore: reportFinalScore,
    riskLevel,
    dimensions: dimensionRows,
    insufficientCount
  };
};
