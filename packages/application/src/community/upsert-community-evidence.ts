import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { recordCollectionRun } from "../collection/record-collection-run.js";

const nowIso = () => new Date().toISOString();

type CommunityWindowSummaryInput = {
  requestedWindowHours?: number | null;
  effectiveWindowHours?: number | null;
  messageCount?: number | null;
  speakerCount?: number | null;
  historyAccessMode?: string | null;
  botAccessStatus?: string | null;
};

type CommunityStructureMetricsInput = {
  activity?: {
    topSpeakersShare?: number | null;
    averageMessagesPerSpeaker?: number | null;
    burstinessScore?: number | null;
  } | null;
  repetition?: {
    duplicateMessageRatio?: number | null;
    shortMessageRatio?: number | null;
    templateSignalRatio?: number | null;
    lowSignalRatio?: number | null;
  } | null;
  discussion?: {
    projectRelevantRatio?: number | null;
    qaInteractionRatio?: number | null;
    offTopicRatio?: number | null;
  } | null;
};

type CommunityMessageSampleInput = {
  bucket?: string | null;
  title?: string | null;
  summary?: string | null;
  itemCount?: number | null;
  sampleMessages?: Array<{
    author?: string | null;
    text?: string | null;
    sentAt?: string | null;
  }>;
};

type CommunityQualityAssessmentInput = {
  overallStatus?: string | null;
  activityQualityScore?: number | null;
  discussionEffectivenessScore?: number | null;
  participationDepthScore?: number | null;
  botRiskScore?: number | null;
  keyFindings?: string[];
};

export interface UpsertCommunityEvidenceInput {
  taskId: string;
  sourceId: string;
  collectorKey: string;
  sourceType: "telegram" | "discord";
  requestedWindowHours?: number | null;
  effectiveWindowHours?: number | null;
  historyAccessMode?: string | null;
  botAccessStatus?: string | null;
  windowSummary?: CommunityWindowSummaryInput | null;
  structureMetrics?: CommunityStructureMetricsInput | null;
  messageSamples?: CommunityMessageSampleInput[];
  qualityAssessment?: CommunityQualityAssessmentInput | null;
}

const assertCommunitySourceExists = (db: DatabaseSync, taskId: string, sourceId: string, sourceType: "telegram" | "discord") => {
  const source = db
    .prepare(
      `SELECT id
       FROM sources
       WHERE task_id = ?
         AND id = ?
         AND source_type = ?`
    )
    .get(taskId, sourceId, sourceType);

  if (!source) {
    throw new Error("community_source_not_found");
  }
};

const deleteExistingEvidenceByType = (
  db: DatabaseSync,
  taskId: string,
  sourceId: string,
  evidenceType: "community_window_summary" | "community_structure_metrics" | "community_message_sample" | "community_quality_assessment"
) => {
  db.prepare(
    `DELETE FROM evidences
     WHERE task_id = ?
       AND source_id = ?
       AND evidence_type = ?`
  ).run(taskId, sourceId, evidenceType);
};

const insertEvidence = (
  db: DatabaseSync,
  taskId: string,
  sourceId: string,
  evidenceType: string,
  title: string,
  summary: string,
  rawContent: unknown
) => {
  const now = nowIso();
  db.prepare(
    `INSERT INTO evidences (
      id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    taskId,
    sourceId,
    evidenceType,
    title,
    summary,
    JSON.stringify(rawContent, null, 2),
    "medium",
    now,
    now
  );
};

export const upsertCommunityEvidence = (db: DatabaseSync, input: UpsertCommunityEvidenceInput) => {
  assertCommunitySourceExists(db, input.taskId, input.sourceId, input.sourceType);

  const now = nowIso();
  let evidenceCount = 0;

  db.prepare(
    `UPDATE community_source_contexts
     SET requested_window_hours = COALESCE(?, requested_window_hours),
         effective_window_hours = ?,
         history_access_mode = COALESCE(?, history_access_mode),
         bot_access_status = COALESCE(?, bot_access_status),
         updated_at = ?
     WHERE task_id = ?
       AND source_id = ?`
  ).run(
    input.requestedWindowHours ?? null,
    input.effectiveWindowHours ?? null,
    input.historyAccessMode ?? null,
    input.botAccessStatus ?? null,
    now,
    input.taskId,
    input.sourceId
  );

  if (input.windowSummary) {
    deleteExistingEvidenceByType(db, input.taskId, input.sourceId, "community_window_summary");
    insertEvidence(
      db,
      input.taskId,
      input.sourceId,
      "community_window_summary",
      "社区窗口摘要",
      `窗口 ${input.windowSummary.effectiveWindowHours ?? input.windowSummary.requestedWindowHours ?? "--"}h，消息 ${input.windowSummary.messageCount ?? 0} 条，发言人数 ${input.windowSummary.speakerCount ?? 0} 人。`,
      input.windowSummary
    );
    evidenceCount += 1;
  }

  if (input.structureMetrics) {
    deleteExistingEvidenceByType(db, input.taskId, input.sourceId, "community_structure_metrics");
    insertEvidence(
      db,
      input.taskId,
      input.sourceId,
      "community_structure_metrics",
      "社区结构指标",
      "已写入活跃结构、重复模板化和讨论有效性指标。",
      input.structureMetrics
    );
    evidenceCount += 1;
  }

  if (Array.isArray(input.messageSamples)) {
    deleteExistingEvidenceByType(db, input.taskId, input.sourceId, "community_message_sample");
    for (const sample of input.messageSamples) {
      insertEvidence(
        db,
        input.taskId,
        input.sourceId,
        "community_message_sample",
        sample.title ?? "社区消息样本",
        sample.summary ?? `样本分桶 ${sample.bucket ?? "unknown"}，样本量 ${sample.itemCount ?? sample.sampleMessages?.length ?? 0} 条。`,
        sample
      );
      evidenceCount += 1;
    }
  }

  if (input.qualityAssessment) {
    deleteExistingEvidenceByType(db, input.taskId, input.sourceId, "community_quality_assessment");
    insertEvidence(
      db,
      input.taskId,
      input.sourceId,
      "community_quality_assessment",
      "社区质量评估",
      `整体状态 ${input.qualityAssessment.overallStatus ?? "unknown"}，活跃质量 ${input.qualityAssessment.activityQualityScore ?? "--"}，异常风险 ${input.qualityAssessment.botRiskScore ?? "--"}。`,
      input.qualityAssessment
    );
    evidenceCount += 1;
  }

  db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run(
    evidenceCount > 0 ? "partial" : "pending",
    now,
    input.sourceId
  );

  db.prepare(`UPDATE analysis_tasks SET collection_status = ?, updated_at = ? WHERE id = ?`).run(
    evidenceCount > 0 ? "evidence_ready" : "collecting",
    now,
    input.taskId
  );

  recordCollectionRun(db, {
    taskId: input.taskId,
    collectorKey: input.collectorKey,
    sourceType: input.sourceType,
    status: evidenceCount > 0 ? "partial" : "failed",
    collectedCount: evidenceCount > 0 ? 1 : 0,
    skippedCount: 0,
    evidenceCount,
    warnings: evidenceCount > 0 ? [] : ["No community evidence payload was provided."]
  });

  return {
    taskId: input.taskId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    collectorKey: input.collectorKey,
    evidenceCount,
    updatedContext: {
      requestedWindowHours: input.requestedWindowHours ?? null,
      effectiveWindowHours: input.effectiveWindowHours ?? null,
      historyAccessMode: input.historyAccessMode ?? null,
      botAccessStatus: input.botAccessStatus ?? null
    }
  };
};
