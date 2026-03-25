import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const nowIso = () => new Date().toISOString();

const clampScore = (score: number): number => Math.max(1, Math.min(10, Number(score.toFixed(1))));

const mapRiskLevel = (finalScore: number): "high" | "medium" | "low" => {
  if (finalScore < 4) {
    return "high";
  }
  if (finalScore < 7) {
    return "medium";
  }
  return "low";
};

export const generateReport = (db: DatabaseSync, taskId: string) => {
  const dimensions = db
    .prepare(`SELECT dimension_name, final_score FROM dimensions WHERE task_id = ? ORDER BY dimension_name`)
    .all(taskId) as Array<{ dimension_name: string; final_score: number }>;

  const factors = db
    .prepare(`SELECT status FROM factors WHERE task_id = ?`)
    .all(taskId) as Array<{ status: string }>;

  const finalScore = clampScore(
    dimensions.reduce((sum, dimension) => sum + dimension.final_score, 0) / Math.max(1, dimensions.length)
  );
  const insufficientCount = factors.filter((factor) => factor.status === "insufficient_evidence").length;
  const riskLevel = mapRiskLevel(finalScore);
  const now = nowIso();
  const summary = `Current report generated from ${dimensions.length} dimensions with aggregate score ${finalScore}.`;
  const dataQualityNote =
    insufficientCount > 0
      ? `${insufficientCount} factors are still marked insufficient_evidence, so the report should be treated as partial.`
      : "All factors currently have some level of evidence support.";

  const existing = db.prepare(`SELECT id FROM reports WHERE task_id = ?`).get(taskId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE reports
       SET final_score = ?, risk_level = ?, summary = ?, data_quality_note = ?, updated_at = ?
       WHERE task_id = ?`
    ).run(finalScore, riskLevel, summary, dataQualityNote, now, taskId);
  } else {
    db.prepare(
      `INSERT INTO reports (id, task_id, final_score, risk_level, summary, data_quality_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), taskId, finalScore, riskLevel, summary, dataQualityNote, now, now);
  }

  return {
    taskId,
    finalScore,
    riskLevel,
    summary,
    dataQualityNote
  };
};
