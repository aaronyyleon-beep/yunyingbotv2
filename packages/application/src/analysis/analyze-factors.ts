import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AnalyzeFactorsResult } from "@yunyingbot/shared";
import { loadFactorsConfig } from "../config/load-factors.js";
import { loadPromptTemplate } from "../prompts/load-prompt-template.js";
import { runFactorAnalysis } from "./run-factor-analysis.js";

const nowIso = () => new Date().toISOString();

const clampScore = (score: number): number => Math.max(1, Math.min(10, Number(score.toFixed(1))));

export const analyzeFactors = async (db: DatabaseSync, repoRoot: string, taskId: string): Promise<AnalyzeFactorsResult> => {
  const factorsConfig = loadFactorsConfig(repoRoot);
  const promptTemplate = loadPromptTemplate(repoRoot, "analyze-factor");
  const evidenceRows = db
    .prepare(`SELECT id, evidence_type, title, summary, raw_content FROM evidences WHERE task_id = ?`)
    .all(taskId) as Array<{ id: string; evidence_type: string; title: string | null; summary: string | null; raw_content: string | null }>;

  const insufficientFactors: string[] = [];
  const dimensionScores = new Map<string, { name: string; scores: number[] }>();
  const now = nowIso();

  db.prepare(`DELETE FROM factors WHERE task_id = ?`).run(taskId);
  db.prepare(`DELETE FROM dimensions WHERE task_id = ?`).run(taskId);

  const insertFactor = db.prepare(
    `INSERT INTO factors (
      id, task_id, factor_key, factor_name, dimension_key, dimension_name, status,
      ai_score, final_score, confidence_level, score_reason, risk_points_json,
      opportunity_points_json, evidence_refs_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const dimension of factorsConfig.dimensions) {
    for (const factor of dimension.factors) {
      const factorAnalysis = await runFactorAnalysis(repoRoot, promptTemplate, factor, evidenceRows);
      const status = factorAnalysis.evidenceSufficiency === "none" ? "insufficient_evidence" : "analyzed";

      insertFactor.run(
        randomUUID(),
        taskId,
        factor.factor_key,
        factor.factor_name,
        dimension.dimension_key,
        dimension.dimension_name,
        status,
        factorAnalysis.aiScore,
        factorAnalysis.aiScore,
        factorAnalysis.confidenceLevel,
        `${factorAnalysis.scoreReason} Analysis mode: ${factorAnalysis.analysisMode}.`,
        JSON.stringify(factorAnalysis.riskPoints),
        JSON.stringify(factorAnalysis.opportunityPoints),
        JSON.stringify(factorAnalysis.evidenceRefs),
        now,
        now
      );

      if (status === "insufficient_evidence") {
        insufficientFactors.push(factor.factor_key);
      }

      const bucket = dimensionScores.get(dimension.dimension_key) ?? { name: dimension.dimension_name, scores: [] };
      bucket.scores.push(factorAnalysis.aiScore);
      dimensionScores.set(dimension.dimension_key, bucket);
    }
  }

  const insertDimension = db.prepare(
    `INSERT INTO dimensions (
      id, task_id, dimension_key, dimension_name, final_score, summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const dimensions = Array.from(dimensionScores.entries()).map(([dimensionKey, bucket]) => {
    const finalScore = clampScore(bucket.scores.reduce((sum, current) => sum + current, 0) / bucket.scores.length);
    insertDimension.run(
      randomUUID(),
      taskId,
      dimensionKey,
      bucket.name,
      finalScore,
      `Baseline dimension score generated from ${bucket.scores.length} factor scores.`,
      now,
      now
    );
    return { dimensionKey, finalScore };
  });

  db.prepare(`UPDATE analysis_tasks SET analysis_status = ?, task_status = ?, updated_at = ? WHERE id = ?`).run(
    "completed",
    "waiting_review",
    now,
    taskId
  );

  return {
    taskId,
    analyzedFactors: factorsConfig.dimensions.reduce((count, dimension) => count + dimension.factors.length, 0),
    insufficientFactors,
    dimensions
  };
};
