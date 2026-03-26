import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

const nowIso = () => new Date().toISOString();
const clampScore = (score: number): number => Math.max(1, Math.min(10, Number(score.toFixed(1))));

const mapRiskLevel = (finalScore: number): "high" | "medium" | "low" => {
  if (finalScore < 4) return "high";
  if (finalScore < 7) return "medium";
  return "low";
};

export const generateReportPg = async (db: AppDbClient, taskId: string) => {
  const dimensions = await db.query<{ dimension_name: string; final_score: number }>(
    `SELECT dimension_name, final_score FROM dimensions WHERE task_id = $1 ORDER BY dimension_name`,
    [taskId]
  );
  const factors = await db.query<{ status: string }>(`SELECT status FROM factors WHERE task_id = $1`, [taskId]);

  const finalScore = clampScore(
    dimensions.reduce((sum, dimension) => sum + Number(dimension.final_score), 0) / Math.max(1, dimensions.length)
  );
  const insufficientCount = factors.filter((factor) => factor.status === "insufficient_evidence").length;
  const riskLevel = mapRiskLevel(finalScore);
  const now = nowIso();
  const summary = `Current report generated from ${dimensions.length} dimensions with aggregate score ${finalScore}.`;
  const dataQualityNote =
    insufficientCount > 0
      ? `${insufficientCount} factors are still marked insufficient_evidence, so the report should be treated as partial.`
      : "All factors currently have some level of evidence support.";

  const existing = await db.one<{ id: string }>(`SELECT id FROM reports WHERE task_id = $1`, [taskId]);
  if (existing) {
    await db.execute(
      `UPDATE reports
       SET final_score = $1, risk_level = $2, summary = $3, data_quality_note = $4, updated_at = $5
       WHERE task_id = $6`,
      [finalScore, riskLevel, summary, dataQualityNote, now, taskId]
    );
  } else {
    await db.execute(
      `INSERT INTO reports (id, task_id, final_score, risk_level, summary, data_quality_note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), taskId, finalScore, riskLevel, summary, dataQualityNote, now, now]
    );
  }

  return {
    taskId,
    finalScore,
    riskLevel,
    summary,
    dataQualityNote
  };
};
