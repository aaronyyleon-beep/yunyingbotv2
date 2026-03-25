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

export const recalculateTask = (db: DatabaseSync, taskId: string) => {
  const factors = db
    .prepare(`SELECT dimension_key, dimension_name, final_score, status FROM factors WHERE task_id = ?`)
    .all(taskId) as Array<{
      dimension_key: string;
      dimension_name: string;
      final_score: number;
      status: string;
    }>;

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
  db.prepare(`DELETE FROM dimensions WHERE task_id = ?`).run(taskId);
  const insertDimension = db.prepare(
    `INSERT INTO dimensions (
      id, task_id, dimension_key, dimension_name, final_score, summary, created_at, updated_at
    ) VALUES (hex(randomblob(16)), ?, ?, ?, ?, ?, ?, ?)`
  );

  const dimensionRows = Array.from(dimensionBuckets.entries()).map(([dimensionKey, bucket]) => {
    const finalScore = clampScore(bucket.scores.reduce((sum, current) => sum + current, 0) / Math.max(1, bucket.scores.length));
    const summary =
      bucket.insufficientCount > 0
        ? `Dimension recalculated from ${bucket.scores.length} factors, including ${bucket.insufficientCount} insufficient factors.`
        : `Dimension recalculated from ${bucket.scores.length} reviewed factors.`;
    insertDimension.run(taskId, dimensionKey, bucket.name, finalScore, summary, now, now);
    return {
      dimensionKey,
      dimensionName: bucket.name,
      finalScore
    };
  });

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

  db.prepare(
    `UPDATE reports
     SET final_score = ?, risk_level = ?, summary = ?, data_quality_note = ?, updated_at = ?
     WHERE task_id = ?`
  ).run(reportFinalScore, riskLevel, summary, dataQualityNote, now, taskId);

  db.prepare(
    `UPDATE analysis_tasks
     SET task_status = ?, review_status = ?, updated_at = ?
     WHERE id = ?`
  ).run("completed", "revised", now, taskId);

  return {
    taskId,
    finalScore: reportFinalScore,
    riskLevel,
    dimensions: dimensionRows,
    insufficientCount
  };
};
