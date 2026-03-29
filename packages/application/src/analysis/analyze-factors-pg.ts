import { randomUUID } from "node:crypto";
import type { AnalyzeFactorsResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { loadFactorsConfig } from "../config/load-factors.js";
import { loadPromptTemplate } from "../prompts/load-prompt-template.js";
import { updateTaskStatuses } from "../repositories/core-task-chain-repository.js";
import { clearFreshEvidenceGateAfterAnalysis } from "../collection/fresh-evidence-gate.js";
import { runFactorAnalysis } from "./run-factor-analysis.js";

const nowIso = () => new Date().toISOString();
const clampScore = (score: number): number => Math.max(1, Math.min(10, Number(score.toFixed(1))));
const ANALYSIS_CONCURRENCY = 4;

interface DimensionConfig {
  dimension_key: string;
  dimension_name: string;
  factors: Array<{
    factor_key: string;
    factor_name: string;
    description: string;
    expected_evidence_types: string[];
  }>;
}

interface FactorWorkItem {
  dimension: DimensionConfig;
  factor: DimensionConfig["factors"][number];
}

const runWithConcurrency = async <TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TOutput>
) => {
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
};

export const analyzeFactorsPg = async (db: AppDbClient, repoRoot: string, taskId: string): Promise<AnalyzeFactorsResult> => {
  const taskGate = await db.one<{ fresh_evidence_ready: boolean }>(
    `SELECT fresh_evidence_ready FROM analysis_tasks WHERE id = $1`,
    [taskId]
  );
  if (!taskGate) {
    throw new Error("task_not_found");
  }
  if (!taskGate.fresh_evidence_ready) {
    throw new Error("fresh_evidence_required");
  }

  const factorsConfig = loadFactorsConfig(repoRoot);
  const promptTemplate = loadPromptTemplate(repoRoot, "analyze-factor");
  const evidenceRows = await db.query<{
    id: string;
    evidence_type: string;
    title: string | null;
    summary: string | null;
    raw_content: string | null;
  }>(`SELECT id, evidence_type, title, summary, raw_content FROM evidences WHERE task_id = $1`, [taskId]);

  const insufficientFactors: string[] = [];
  const dimensionScores = new Map<string, { name: string; scores: number[] }>();
  const now = nowIso();
  const factorItems = factorsConfig.dimensions.flatMap((dimension) =>
    dimension.factors.map((factor) => ({ dimension, factor }))
  ) as FactorWorkItem[];

  await db.execute(`DELETE FROM factors WHERE task_id = $1`, [taskId]);
  await db.execute(`DELETE FROM dimensions WHERE task_id = $1`, [taskId]);

  const analyzedFactors = await runWithConcurrency(factorItems, ANALYSIS_CONCURRENCY, async ({ factor }) =>
    runFactorAnalysis(repoRoot, promptTemplate, factor, evidenceRows)
  );

  for (const [index, { dimension, factor }] of factorItems.entries()) {
    const factorAnalysis = analyzedFactors[index];
    const status = factorAnalysis.evidenceSufficiency === "none" ? "insufficient_evidence" : "analyzed";

    await db.execute(
      `INSERT INTO factors (
        id, task_id, factor_key, factor_name, dimension_key, dimension_name, status,
        ai_score, final_score, confidence_level, score_reason, risk_points_json,
        opportunity_points_json, evidence_refs_json, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
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
      ]
    );

    if (status === "insufficient_evidence") {
      insufficientFactors.push(factor.factor_key);
    }

    const bucket = dimensionScores.get(dimension.dimension_key) ?? { name: dimension.dimension_name, scores: [] };
    bucket.scores.push(factorAnalysis.aiScore);
    dimensionScores.set(dimension.dimension_key, bucket);
  }

  const dimensions = [];
  for (const [dimensionKey, bucket] of dimensionScores.entries()) {
    const finalScore = clampScore(bucket.scores.reduce((sum, current) => sum + current, 0) / bucket.scores.length);
    await db.execute(
      `INSERT INTO dimensions (
        id, task_id, dimension_key, dimension_name, final_score, summary, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        taskId,
        dimensionKey,
        bucket.name,
        finalScore,
        `Baseline dimension score generated from ${bucket.scores.length} factor scores.`,
        now,
        now
      ]
    );
    dimensions.push({ dimensionKey, finalScore });
  }

  await updateTaskStatuses(db, {
    taskId,
    analysisStatus: "completed",
    taskStatus: "waiting_review"
  });
  await clearFreshEvidenceGateAfterAnalysis(db, taskId);

  return {
    taskId,
    analyzedFactors: factorsConfig.dimensions.reduce((count, dimension) => count + dimension.factors.length, 0),
    insufficientFactors,
    dimensions
  };
};
