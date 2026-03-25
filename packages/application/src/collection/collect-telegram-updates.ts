import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import { upsertCommunityEvidence } from "../community/upsert-community-evidence.js";
import { loadRepoEnv } from "../config/load-env.js";

type TelegramChatResponse = {
  ok: boolean;
  result?: {
    id: number;
    title?: string;
    username?: string;
    type?: string;
  };
  description?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  date: number;
  message_thread_id?: number;
  text?: string;
  caption?: string;
  from?: {
    id: number;
    username?: string;
    first_name?: string;
  };
  chat: {
    id: number;
    title?: string;
    username?: string;
    type?: string;
  };
};

type TelegramUpdatesResponse = {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

type BufferedCommunityMessage = {
  externalMessageId: string;
  sentAt: string;
  sentAtUnix: number;
  authorId: string | null;
  authorLabel: string;
  text: string;
};

const nowIso = () => new Date().toISOString();

const normalizeText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim();

const extractTelegramTarget = (sourceUrl: string, fallbackLabel?: string | null): string | null => {
  if (fallbackLabel) {
    return `@${fallbackLabel.replace(/^@/, "")}`;
  }

  try {
    const url = new URL(sourceUrl);
    const first = url.pathname.split("/").filter(Boolean)[0];
    return first ? `@${first.replace(/^@/, "")}` : null;
  } catch {
    return null;
  }
};

const computeRatio = (count: number, total: number): number | null => {
  if (!total) return null;
  return Number((count / total).toFixed(4));
};

const keywordMatch = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

const LOW_SIGNAL_EXACT_MATCHES = new Set([
  "gm",
  "gn",
  "gg",
  "hi",
  "hello",
  "ok",
  "okay",
  "wow",
  "nice",
  "lol",
  "lfg",
  "thanks",
  "thank you",
  "哈哈",
  "哈哈哈",
  "早",
  "早安",
  "晚安"
]);

const isLowSignalMessage = (text: string): boolean => {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return true;
  if (LOW_SIGNAL_EXACT_MATCHES.has(normalized)) return true;
  if (normalized.length <= 3 && !/[a-z0-9\u4e00-\u9fa5]/i.test(normalized)) return true;
  if (/^(<a?:\w+:\d+>\s*)+$/.test(normalized)) return true;
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\W_]+$/u.test(normalized)) return true;
  return false;
};

const sampleUnique = <T>(items: T[], limit: number, keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
};

const insertTelegramMessagesIntoBuffer = (db: DatabaseSync, messages: TelegramMessage[]) => {
  const insertStatement = db.prepare(
    `INSERT OR IGNORE INTO community_message_buffer (
      id, platform, external_chat_id, external_message_id, chat_title, author_id, author_label, text_content, sent_at, raw_payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const message of messages) {
    const text = normalizeText(message.text ?? message.caption ?? "");
    if (!text) continue;

    insertStatement.run(
      randomUUID(),
      "telegram",
      String(message.chat.id),
      String(message.message_id),
      message.chat.title ?? message.chat.username ?? null,
      message.from?.id ? String(message.from.id) : null,
      message.from?.username ?? message.from?.first_name ?? String(message.from?.id ?? "unknown"),
      text,
      new Date(message.date * 1000).toISOString(),
      JSON.stringify(message),
      nowIso()
    );
  }
};

const readBufferedMessages = (db: DatabaseSync, chatId: string, requestedWindowHours: number): BufferedCommunityMessage[] => {
  const sinceIso = new Date(Date.now() - requestedWindowHours * 60 * 60 * 1000).toISOString();

  const rows = db
    .prepare(
      `SELECT
        external_message_id,
        sent_at,
        author_id,
        author_label,
        text_content
      FROM community_message_buffer
      WHERE platform = 'telegram'
        AND external_chat_id = ?
        AND sent_at >= ?
      ORDER BY sent_at ASC`
    )
    .all(chatId, sinceIso) as Array<{
      external_message_id: string;
      sent_at: string;
      author_id: string | null;
      author_label: string | null;
      text_content: string;
    }>;

  return rows.map((row) => ({
    externalMessageId: row.external_message_id,
    sentAt: row.sent_at,
    sentAtUnix: Math.floor(new Date(row.sent_at).getTime() / 1000),
    authorId: row.author_id,
    authorLabel: row.author_label ?? "unknown",
    text: row.text_content
  }));
};

export const collectTelegramUpdates = async (db: DatabaseSync, repoRoot: string, taskId: string): Promise<PublicCollectionResult> => {
  const env = loadRepoEnv(repoRoot);
  const token = env.TELEGRAM_BOT_TOKEN?.trim();

  const sources = db
    .prepare(
      `SELECT
        s.id,
        s.source_url,
        c.target_label,
        c.requested_window_hours
       FROM sources s
       LEFT JOIN community_source_contexts c ON c.source_id = s.id AND c.task_id = s.task_id
       WHERE s.task_id = ?
         AND s.source_type = 'telegram'`
    )
    .all(taskId) as Array<{
      id: string;
      source_url: string;
      target_label: string | null;
      requested_window_hours: number | null;
    }>;

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;

  if (!token) {
    warnings.push("TELEGRAM_BOT_TOKEN is not configured.");
    return { taskId, collectedSources, skippedSources: sources.map((source) => source.source_url), warnings, evidenceCount };
  }

  if (sources.length === 0) {
    warnings.push("当前任务没有 Telegram 来源，无法执行 Telegram 社区采集。");
    return { taskId, collectedSources, skippedSources, warnings, evidenceCount };
  }

  const updatesResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
  const updatesPayload = (await updatesResponse.json()) as TelegramUpdatesResponse;
  if (!updatesPayload.ok || !Array.isArray(updatesPayload.result)) {
    warnings.push(`Telegram getUpdates failed: ${updatesPayload.description ?? "unknown_error"}`);
    return { taskId, collectedSources, skippedSources: sources.map((source) => source.source_url), warnings, evidenceCount };
  }

  const updates = updatesPayload.result;
  const maxUpdateId = updates.reduce((max, item) => Math.max(max, item.update_id), 0);
  const updateMessages = updates
    .map((item) => item.message ?? item.edited_message ?? null)
    .filter((message): message is TelegramMessage => Boolean(message));

  insertTelegramMessagesIntoBuffer(db, updateMessages);

  for (const source of sources) {
    const target = extractTelegramTarget(source.source_url, source.target_label);
    if (!target) {
      warnings.push(`Could not infer telegram target from ${source.source_url}`);
      skippedSources.push(source.source_url);
      continue;
    }

    const chatResponse = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(target)}`);
    const chatPayload = (await chatResponse.json()) as TelegramChatResponse;
    if (!chatPayload.ok || !chatPayload.result) {
      warnings.push(`Telegram getChat failed for ${target}: ${chatPayload.description ?? "unknown_error"}`);
      skippedSources.push(source.source_url);
      continue;
    }

    const chatId = String(chatPayload.result.id);
    const chatTitle = chatPayload.result.title ?? chatPayload.result.username ?? target;
    const requestedWindowHours = source.requested_window_hours ?? 72;
    const bufferedMessages = readBufferedMessages(db, chatId, requestedWindowHours);

    if (bufferedMessages.length === 0) {
      warnings.push(`Telegram buffer currently has no readable messages for ${chatTitle} in the requested ${requestedWindowHours}h window.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const totalMessages = bufferedMessages.length;
    const uniqueAuthors = new Set(bufferedMessages.map((message) => message.authorId ?? message.authorLabel)).size;
    const authorCounts = new Map<string, number>();
    const textCounts = new Map<string, number>();
    for (const message of bufferedMessages) {
      const authorKey = message.authorId ?? message.authorLabel;
      authorCounts.set(authorKey, (authorCounts.get(authorKey) ?? 0) + 1);
      textCounts.set(message.text.toLowerCase(), (textCounts.get(message.text.toLowerCase()) ?? 0) + 1);
    }

    const topSpeakers = Array.from(authorCounts.values()).sort((a, b) => b - a).slice(0, 10);
    const topSpeakersShare = computeRatio(topSpeakers.reduce((sum, count) => sum + count, 0), totalMessages);
    const averageMessagesPerSpeaker = uniqueAuthors ? Number((totalMessages / uniqueAuthors).toFixed(2)) : null;
    const duplicateMessages = Array.from(textCounts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
    const duplicateMessageRatio = computeRatio(duplicateMessages, totalMessages);
    const shortMessageRatio = computeRatio(bufferedMessages.filter((message) => message.text.length <= 12).length, totalMessages);
    const templateSignalRatio = computeRatio(
      bufferedMessages.filter((message) => (textCounts.get(message.text.toLowerCase()) ?? 0) >= 3).length,
      totalMessages
    );

    const contentBearingMessages = bufferedMessages.filter((message) => !isLowSignalMessage(message.text));
    const lowSignalRatio = computeRatio(totalMessages - contentBearingMessages.length, totalMessages);

    const titleKeywords = chatTitle
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .filter((tokenPart) => tokenPart.length >= 2);
    const projectKeywords = Array.from(new Set([...titleKeywords, "tge", "listing", "bridge", "token", "launch", "beat", "coin"]));
    const projectRelevantMessages = contentBearingMessages.filter((message) => keywordMatch(message.text, projectKeywords));
    const questionMessages = contentBearingMessages.filter(
      (message) => /\?$/.test(message.text) || /^(how|what|when|why|wen|where)\b/i.test(message.text)
    );
    const offTopicMessages = contentBearingMessages.filter(
      (message) => !keywordMatch(message.text, projectKeywords) && message.text.length <= 20
    );

    const timestamps = bufferedMessages.map((message) => message.sentAtUnix).sort((a, b) => a - b);
    const effectiveWindowHours =
      timestamps.length >= 2 ? Number((((timestamps.at(-1) ?? timestamps[0]) - timestamps[0]) / 3600).toFixed(2)) : 0;

    const repeatedMessages = bufferedMessages.filter((message) => (textCounts.get(message.text.toLowerCase()) ?? 0) >= 2);
    const repeatedContentMessages = repeatedMessages.filter((message) => !isLowSignalMessage(message.text));
    const baselineSamplePool = contentBearingMessages.length >= 5 ? contentBearingMessages : bufferedMessages;

    const activityQualityScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            5.5 +
            (averageMessagesPerSpeaker && averageMessagesPerSpeaker >= 2 ? 0.6 : -0.4) +
            (topSpeakersShare !== null && topSpeakersShare < 0.65 ? 0.7 : -0.8) +
            (shortMessageRatio !== null && shortMessageRatio < 0.45 ? 0.5 : -0.6) +
            (lowSignalRatio !== null && lowSignalRatio < 0.35 ? 0.4 : -0.5)
          ).toFixed(1)
        )
      )
    );
    const discussionEffectivenessScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            4.8 +
            ((computeRatio(projectRelevantMessages.length, totalMessages) ?? 0) * 8) +
            ((computeRatio(questionMessages.length, totalMessages) ?? 0) * 4) -
            ((computeRatio(offTopicMessages.length, totalMessages) ?? 0) * 3) -
            ((lowSignalRatio ?? 0) * 3)
          ).toFixed(1)
        )
      )
    );
    const participationDepthScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            4.5 +
            (uniqueAuthors >= 8 ? 0.8 : -0.6) +
            ((computeRatio(questionMessages.length, totalMessages) ?? 0) * 4) +
            ((computeRatio(projectRelevantMessages.length, totalMessages) ?? 0) * 3)
          ).toFixed(1)
        )
      )
    );
    const botRiskScore = Math.max(
      1,
      Math.min(
        10,
        Number(
          (
            3.8 +
            ((duplicateMessageRatio ?? 0) * 8) +
            ((templateSignalRatio ?? 0) * 8) +
            (topSpeakersShare !== null && topSpeakersShare > 0.75 ? 1.2 : 0)
          ).toFixed(1)
        )
      )
    );

    const keyFindings: string[] = [];
    keyFindings.push(`当前窗口内读取到 ${totalMessages} 条消息，覆盖 ${uniqueAuthors} 名发言用户。`);
    if (topSpeakersShare !== null) {
      keyFindings.push(`前 10 名发言者占比 ${Math.round(topSpeakersShare * 100)}%。`);
    }
    if (duplicateMessageRatio !== null) {
      keyFindings.push(`重复文本占比 ${Math.round(duplicateMessageRatio * 100)}%。`);
    }
    if ((computeRatio(projectRelevantMessages.length, totalMessages) ?? 0) > 0.2) {
      keyFindings.push("窗口内存在一定比例的项目相关讨论。");
    }
    if (effectiveWindowHours < requestedWindowHours) {
      keyFindings.push(`当前仅覆盖约 ${effectiveWindowHours} 小时有效消息窗口，尚未达到请求的 ${requestedWindowHours} 小时。`);
    }

    const overallStatus =
      botRiskScore >= 7 ? "high_risk" : discussionEffectivenessScore >= 6 && activityQualityScore >= 6 ? "healthy" : "moderate";

    const result = upsertCommunityEvidence(db, {
      taskId,
      sourceId: source.id,
      sourceType: "telegram",
      collectorKey: "telegram_bot_ingestion",
      requestedWindowHours,
      effectiveWindowHours,
      historyAccessMode: effectiveWindowHours >= requestedWindowHours ? "historical_read" : "live_only",
      botAccessStatus: "bot_ready",
      windowSummary: {
        requestedWindowHours,
        effectiveWindowHours,
        messageCount: totalMessages,
        speakerCount: uniqueAuthors,
        historyAccessMode: effectiveWindowHours >= requestedWindowHours ? "historical_read" : "live_only",
        botAccessStatus: "bot_ready"
      },
      structureMetrics: {
        activity: {
          topSpeakersShare,
          averageMessagesPerSpeaker,
          burstinessScore: null
        },
        repetition: {
          duplicateMessageRatio,
          shortMessageRatio,
          templateSignalRatio,
          lowSignalRatio
        },
        discussion: {
          projectRelevantRatio: computeRatio(projectRelevantMessages.length, totalMessages),
          qaInteractionRatio: computeRatio(questionMessages.length, totalMessages),
          offTopicRatio: computeRatio(offTopicMessages.length, totalMessages)
        }
      },
      messageSamples: [
        {
          bucket: "project_relevant",
          title: `${chatTitle} 项目相关样本`,
          summary: "命中项目关键词、路线图、TGE、产品或文档讨论的消息样本。",
          itemCount: projectRelevantMessages.length,
          sampleMessages: sampleUnique(projectRelevantMessages, 5, (item) => `${item.authorLabel}-${item.externalMessageId}`).map((item) => ({
            author: item.authorLabel,
            text: item.text,
            sentAt: item.sentAt
          }))
        },
        {
          bucket: "qa_interactions",
          title: `${chatTitle} 问答互动样本`,
          summary: "带明显提问或互动承接的消息样本。",
          itemCount: questionMessages.length,
          sampleMessages: sampleUnique(questionMessages, 5, (item) => `${item.authorLabel}-${item.externalMessageId}`).map((item) => ({
            author: item.authorLabel,
            text: item.text,
            sentAt: item.sentAt
          }))
        },
        {
          bucket: "repeated_messages",
          title: `${chatTitle} 重复文本样本`,
          summary: "高重复或模板化文本样本，用于辅助判断异常活跃与任务盘痕迹。",
          itemCount: repeatedMessages.length,
          sampleMessages: sampleUnique(
            repeatedContentMessages.length > 0 ? repeatedContentMessages : repeatedMessages,
            5,
            (item) => `${item.authorLabel}-${item.externalMessageId}`
          ).map((item) => ({
            author: item.authorLabel,
            text: item.text,
            sentAt: item.sentAt
          }))
        },
        {
          bucket: "baseline_random",
          title: `${chatTitle} 常规活跃样本`,
          summary: "当前窗口内的常规随机消息样本。",
          itemCount: totalMessages,
          sampleMessages: sampleUnique(baselineSamplePool, 5, (item) => `${item.authorLabel}-${item.externalMessageId}`).map((item) => ({
            author: item.authorLabel,
            text: item.text,
            sentAt: item.sentAt
          }))
        }
      ],
      qualityAssessment: {
        overallStatus,
        activityQualityScore,
        discussionEffectivenessScore,
        participationDepthScore,
        botRiskScore,
        keyFindings
      }
    });

    evidenceCount += result.evidenceCount;
    collectedSources.push(source.source_url);
  }

  if (maxUpdateId > 0) {
    await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${maxUpdateId + 1}&limit=1`);
  }

  return {
    taskId,
    collectedSources,
    skippedSources,
    warnings,
    evidenceCount
  };
};
