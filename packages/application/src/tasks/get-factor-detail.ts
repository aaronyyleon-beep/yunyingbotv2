import type { DatabaseSync } from "node:sqlite";
import { parseJsonArray, parseJsonObject } from "./parse-json.js";

interface TwitterPostDetailPayload {
  text?: string;
  datetime?: string | null;
  metrics?: {
    replies?: number | null;
    reposts?: number | null;
    likes?: number | null;
    bookmarks?: number | null;
    views?: number | null;
  };
}

interface TwitterAssessmentPayload {
  pageStatus?: string;
  statusReason?: string;
  tweetQualityScore?: number | null;
  commentQualityScore?: number | null;
  replyCount?: number | null;
}

interface CommunityWindowSummaryPayload {
  requestedWindowHours?: number | null;
  effectiveWindowHours?: number | null;
  messageCount?: number | null;
  speakerCount?: number | null;
  historyAccessMode?: string | null;
  botAccessStatus?: string | null;
}

interface CommunityStructureMetricsPayload {
  activity?: {
    topSpeakersShare?: number | null;
    averageMessagesPerSpeaker?: number | null;
    burstinessScore?: number | null;
  };
  repetition?: {
    duplicateMessageRatio?: number | null;
    shortMessageRatio?: number | null;
    templateSignalRatio?: number | null;
    lowSignalRatio?: number | null;
  };
  discussion?: {
    projectRelevantRatio?: number | null;
    qaInteractionRatio?: number | null;
    offTopicRatio?: number | null;
  };
}

interface CommunityQualityAssessmentPayload {
  overallStatus?: string | null;
  activityQualityScore?: number | null;
  discussionEffectivenessScore?: number | null;
  participationDepthScore?: number | null;
  botRiskScore?: number | null;
  keyFindings?: string[];
}

const formatRatioText = (value?: number | null) => (value === null || value === undefined ? null : `${(value * 100).toFixed(1)}%`);

export const getFactorDetail = (db: DatabaseSync, taskId: string, factorId: string) => {
  const factor = db.prepare(`SELECT * FROM factors WHERE task_id = ? AND id = ?`).get(taskId, factorId);
  if (!factor) {
    return null;
  }

  const reviews = db
    .prepare(`SELECT * FROM review_records WHERE task_id = ? AND factor_id = ? ORDER BY created_at DESC`)
    .all(taskId, factorId);

  const evidenceIds = parseJsonArray((factor as { evidence_refs_json?: string }).evidence_refs_json);
  const evidences =
    evidenceIds.length > 0
      ? db
          .prepare(
            `SELECT id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at
             FROM evidences
             WHERE task_id = ? AND id IN (${evidenceIds.map(() => "?").join(",")})`
          )
          .all(taskId, ...evidenceIds)
      : [];

  const normalizedEvidences = evidences.map((evidence) => {
    const base = evidence as {
      id: string;
      source_id: string;
      evidence_type: string;
      title: string | null;
      summary: string | null;
      raw_content?: string | null;
      credibility_level: string;
      captured_at: string;
    };

    let insightSummary: string | null = null;

    if (base.evidence_type === "twitter_post_detail") {
      const payload = parseJsonObject<TwitterPostDetailPayload>(base.raw_content);
      const metrics = payload?.metrics ?? null;
      const metricParts = [
        metrics?.views !== undefined && metrics?.views !== null ? `查看 ${metrics.views}` : null,
        metrics?.replies !== undefined && metrics?.replies !== null ? `回复 ${metrics.replies}` : null,
        metrics?.reposts !== undefined && metrics?.reposts !== null ? `转发 ${metrics.reposts}` : null,
        metrics?.likes !== undefined && metrics?.likes !== null ? `点赞 ${metrics.likes}` : null,
        metrics?.bookmarks !== undefined && metrics?.bookmarks !== null ? `收藏 ${metrics.bookmarks}` : null
      ].filter((item): item is string => item !== null);

      insightSummary = [payload?.text?.trim() || null, metricParts.length > 0 ? metricParts.join(" | ") : null]
        .filter((item): item is string => Boolean(item))
        .join(" | ");
    }

    if (base.evidence_type === "twitter_page_assessment") {
      const payload = parseJsonObject<TwitterAssessmentPayload>(base.raw_content);
      const parts = [
        payload?.pageStatus ? `页面判断 ${payload.pageStatus}` : null,
        payload?.statusReason ? payload.statusReason : null,
        payload?.tweetQualityScore !== undefined && payload?.tweetQualityScore !== null ? `内容参考分 ${payload.tweetQualityScore}` : null,
        payload?.commentQualityScore !== undefined && payload?.commentQualityScore !== null
          ? `评论参考分 ${payload.commentQualityScore}`
          : null,
        payload?.replyCount !== undefined && payload?.replyCount !== null ? `可见评论 ${payload.replyCount}` : null
      ].filter((item): item is string => item !== null);

      insightSummary = parts.join(" | ");
    }

    if (base.evidence_type === "community_window_summary") {
      const payload = parseJsonObject<CommunityWindowSummaryPayload>(base.raw_content);
      const parts = [
        payload?.requestedWindowHours !== undefined && payload?.requestedWindowHours !== null
          ? `请求窗口 ${payload.requestedWindowHours}h`
          : null,
        payload?.effectiveWindowHours !== undefined && payload?.effectiveWindowHours !== null
          ? `有效窗口 ${payload.effectiveWindowHours}h`
          : null,
        payload?.messageCount !== undefined && payload?.messageCount !== null ? `消息 ${payload.messageCount}` : null,
        payload?.speakerCount !== undefined && payload?.speakerCount !== null ? `发言人数 ${payload.speakerCount}` : null
      ].filter((item): item is string => item !== null);

      insightSummary = parts.join(" | ");
    }

    if (base.evidence_type === "community_structure_metrics") {
      const payload = parseJsonObject<CommunityStructureMetricsPayload>(base.raw_content);
      const parts = [
        payload?.activity?.topSpeakersShare !== undefined && payload?.activity?.topSpeakersShare !== null
          ? `头部发言占比 ${formatRatioText(payload.activity.topSpeakersShare)}`
          : null,
        payload?.repetition?.duplicateMessageRatio !== undefined && payload?.repetition?.duplicateMessageRatio !== null
          ? `重复文本 ${formatRatioText(payload.repetition.duplicateMessageRatio)}`
          : null,
        payload?.repetition?.lowSignalRatio !== undefined && payload?.repetition?.lowSignalRatio !== null
          ? `低信息消息 ${formatRatioText(payload.repetition.lowSignalRatio)}`
          : null,
        payload?.discussion?.projectRelevantRatio !== undefined && payload?.discussion?.projectRelevantRatio !== null
          ? `项目相关 ${formatRatioText(payload.discussion.projectRelevantRatio)}`
          : null,
        payload?.discussion?.qaInteractionRatio !== undefined && payload?.discussion?.qaInteractionRatio !== null
          ? `问答互动 ${formatRatioText(payload.discussion.qaInteractionRatio)}`
          : null
      ].filter((item): item is string => item !== null);

      insightSummary = parts.join(" | ");
    }

    if (base.evidence_type === "community_quality_assessment") {
      const payload = parseJsonObject<CommunityQualityAssessmentPayload>(base.raw_content);
      const parts = [
        payload?.overallStatus ? `整体状态 ${payload.overallStatus}` : null,
        payload?.activityQualityScore !== undefined && payload?.activityQualityScore !== null ? `活跃质量 ${payload.activityQualityScore}` : null,
        payload?.discussionEffectivenessScore !== undefined && payload?.discussionEffectivenessScore !== null
          ? `讨论有效性 ${payload.discussionEffectivenessScore}`
          : null,
        payload?.participationDepthScore !== undefined && payload?.participationDepthScore !== null
          ? `参与深度 ${payload.participationDepthScore}`
          : null,
        payload?.botRiskScore !== undefined && payload?.botRiskScore !== null ? `异常风险 ${payload.botRiskScore}` : null
      ].filter((item): item is string => item !== null);

      insightSummary = parts.join(" | ");
    }

    return {
      ...base,
      insight_summary: insightSummary
    };
  });

  const twitterPostDetail =
    normalizedEvidences
      .filter((evidence) => evidence.evidence_type === "twitter_post_detail")
      .map((evidence) => parseJsonObject<TwitterPostDetailPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  const twitterAssessment =
    normalizedEvidences
      .filter((evidence) => evidence.evidence_type === "twitter_page_assessment")
      .map((evidence) => parseJsonObject<TwitterAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  const communityWindowSummary =
    normalizedEvidences
      .filter((evidence) => evidence.evidence_type === "community_window_summary")
      .map((evidence) => parseJsonObject<CommunityWindowSummaryPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  const communityStructureMetrics =
    normalizedEvidences
      .filter((evidence) => evidence.evidence_type === "community_structure_metrics")
      .map((evidence) => parseJsonObject<CommunityStructureMetricsPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  const communityQualityAssessment =
    normalizedEvidences
      .filter((evidence) => evidence.evidence_type === "community_quality_assessment")
      .map((evidence) => parseJsonObject<CommunityQualityAssessmentPayload>(evidence.raw_content))
      .find((value) => value !== null) ?? null;

  return {
    factor: {
      ...(factor as Record<string, unknown>),
      risk_points: parseJsonArray((factor as { risk_points_json?: string }).risk_points_json),
      opportunity_points: parseJsonArray((factor as { opportunity_points_json?: string }).opportunity_points_json),
      evidence_refs: evidenceIds
    },
    evidences: normalizedEvidences,
    twitter_detail:
      twitterPostDetail || twitterAssessment
        ? {
            text: twitterPostDetail?.text ?? null,
            published_at: twitterPostDetail?.datetime ?? null,
            metrics: twitterPostDetail?.metrics ?? null,
            page_status: twitterAssessment?.pageStatus ?? null,
            status_reason: twitterAssessment?.statusReason ?? null,
            tweet_quality_score: twitterAssessment?.tweetQualityScore ?? null,
            comment_quality_score: twitterAssessment?.commentQualityScore ?? null,
            visible_reply_count: twitterAssessment?.replyCount ?? null
          }
        : null,
    community_detail:
      communityWindowSummary || communityStructureMetrics || communityQualityAssessment
        ? {
            window_summary: communityWindowSummary
              ? {
                  requested_window_hours: communityWindowSummary.requestedWindowHours ?? null,
                  effective_window_hours: communityWindowSummary.effectiveWindowHours ?? null,
                  message_count: communityWindowSummary.messageCount ?? null,
                  speaker_count: communityWindowSummary.speakerCount ?? null,
                  history_access_mode: communityWindowSummary.historyAccessMode ?? null,
                  bot_access_status: communityWindowSummary.botAccessStatus ?? null
                }
              : null,
            structure_metrics: communityStructureMetrics
              ? {
                  activity: communityStructureMetrics.activity ?? null,
                  repetition: communityStructureMetrics.repetition ?? null,
                  discussion: communityStructureMetrics.discussion ?? null
                }
              : null,
            quality_assessment: communityQualityAssessment
              ? {
                  overall_status: communityQualityAssessment.overallStatus ?? null,
                  activity_quality_score: communityQualityAssessment.activityQualityScore ?? null,
                  discussion_effectiveness_score: communityQualityAssessment.discussionEffectivenessScore ?? null,
                  participation_depth_score: communityQualityAssessment.participationDepthScore ?? null,
                  bot_risk_score: communityQualityAssessment.botRiskScore ?? null,
                  key_findings: communityQualityAssessment.keyFindings ?? []
                }
              : null
          }
        : null,
    reviews
  };
};
