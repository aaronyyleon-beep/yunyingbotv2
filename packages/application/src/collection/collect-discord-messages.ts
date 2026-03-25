import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import { upsertCommunityEvidence } from "../community/upsert-community-evidence.js";
import { loadRepoEnv } from "../config/load-env.js";

type DiscordInviteResponse = {
  guild?: {
    id: string;
    name: string;
  };
};

type DiscordChannel = {
  id: string;
  guild_id?: string;
  name: string;
  type: number;
  parent_id?: string | null;
  last_message_id?: string | null;
};

type DiscordMessage = {
  id: string;
  type?: number;
  webhook_id?: string;
  content: string;
  timestamp: string;
  author: {
    id: string;
    username: string;
    global_name?: string | null;
    bot?: boolean;
  };
};

type BufferedDiscordMessage = {
  externalMessageId: string;
  sentAt: string;
  authorId: string | null;
  authorLabel: string;
  text: string;
  channelId: string;
  channelName: string;
};

const DISCORD_BASE_URL = "https://discord.com/api/v10";
const DISCUSSION_NAME_HINTS = [
  "general",
  "chat",
  "discussion",
  "community",
  "talk",
  "alpha",
  "中文",
  "english",
  "global",
  "off-topic",
  "main"
];
const EXCLUDED_NAME_HINTS = [
  "rules",
  "rule",
  "announcement",
  "announcements",
  "verify",
  "verification",
  "role",
  "roles",
  "ticket",
  "tickets",
  "log",
  "logs",
  "mod",
  "admin",
  "support",
  "faq"
];

const normalizeText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim();

const computeRatio = (count: number, total: number): number | null => {
  if (!total) return null;
  return Number((count / total).toFixed(4));
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

const parseDiscordInviteCode = (sourceUrl: string, fallbackLabel?: string | null): string | null => {
  if (fallbackLabel && !fallbackLabel.includes("/")) {
    return fallbackLabel;
  }

  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
};

const fetchDiscordJson = async <T>(token: string, path: string): Promise<T> => {
  const response = await fetch(`${DISCORD_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bot ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`discord_request_failed:${response.status}:${path}`);
  }

  return (await response.json()) as T;
};

const shouldKeepDiscordMessage = (message: DiscordMessage) => {
  if (message.author?.bot) return false;
  if (message.webhook_id) return false;
  if (message.type && message.type !== 0) return false;
  const text = normalizeText(message.content);
  if (!text) return false;
  return true;
};

const insertDiscordMessagesIntoBuffer = (
  db: DatabaseSync,
  guildId: string,
  guildName: string,
  channelId: string,
  channelName: string,
  messages: DiscordMessage[]
) => {
  const insertStatement = db.prepare(
    `INSERT OR IGNORE INTO community_message_buffer (
      id, platform, external_chat_id, external_message_id, chat_title, author_id, author_label, text_content, sent_at, raw_payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let insertedCount = 0;
  for (const message of messages) {
    if (!shouldKeepDiscordMessage(message)) {
      continue;
    }

    insertStatement.run(
      randomUUID(),
      "discord",
      `${guildId}:${channelId}`,
      message.id,
      `${guildName} / ${channelName}`,
      message.author?.id ?? null,
      message.author?.global_name ?? message.author?.username ?? "unknown",
      normalizeText(message.content),
      message.timestamp,
      JSON.stringify(message),
      new Date().toISOString()
    );
    insertedCount += 1;
  }

  return insertedCount;
};

const readBufferedDiscordMessages = (db: DatabaseSync, guildId: string, channelIds: string[], requestedWindowHours: number) => {
  if (channelIds.length === 0) {
    return [] as BufferedDiscordMessage[];
  }

  const sinceIso = new Date(Date.now() - requestedWindowHours * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT
        external_chat_id,
        external_message_id,
        chat_title,
        author_id,
        author_label,
        text_content,
        sent_at,
        raw_payload
       FROM community_message_buffer
       WHERE platform = 'discord'
         AND external_chat_id IN (${channelIds.map(() => "?").join(",")})
         AND sent_at >= ?
       ORDER BY sent_at ASC`
    )
    .all(...channelIds.map((channelId) => `${guildId}:${channelId}`), sinceIso) as Array<{
      external_chat_id: string;
      external_message_id: string;
      chat_title: string | null;
      author_id: string | null;
      author_label: string | null;
      text_content: string;
      sent_at: string;
      raw_payload: string | null;
    }>;

  return rows
    .filter((row) => {
      if (!row.raw_payload) return true;
      try {
        const payload = JSON.parse(row.raw_payload) as DiscordMessage;
        return shouldKeepDiscordMessage(payload);
      } catch {
        return true;
      }
    })
    .map((row) => {
      const chatTitle = row.chat_title ?? "";
      const channelName = chatTitle.includes(" / ") ? chatTitle.split(" / ").at(-1) ?? chatTitle : chatTitle;
      const channelId = row.external_chat_id.split(":").at(-1) ?? row.external_chat_id;

      return {
        externalMessageId: row.external_message_id,
        sentAt: row.sent_at,
        authorId: row.author_id,
        authorLabel: row.author_label ?? "unknown",
        text: row.text_content,
        channelId,
        channelName
      };
    });
};

const scoreChannelCandidate = (channel: DiscordChannel) => {
  const name = channel.name.toLowerCase();
  let score = 0;

  if (channel.type === 0) score += 2;
  if (DISCUSSION_NAME_HINTS.some((hint) => name.includes(hint.toLowerCase()))) score += 3;
  if (EXCLUDED_NAME_HINTS.some((hint) => name.includes(hint))) score -= 4;
  if (channel.last_message_id) score += 1;

  return score;
};

export const collectDiscordMessages = async (db: DatabaseSync, repoRoot: string, taskId: string): Promise<PublicCollectionResult> => {
  const env = loadRepoEnv(repoRoot);
  const token = env.DISCORD_BOT_TOKEN?.trim();

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
         AND s.source_type = 'discord'`
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
    warnings.push("DISCORD_BOT_TOKEN is not configured.");
    return { taskId, collectedSources, skippedSources: sources.map((source) => source.source_url), warnings, evidenceCount };
  }

  for (const source of sources) {
    const inviteCode = parseDiscordInviteCode(source.source_url, source.target_label);
    if (!inviteCode) {
      warnings.push(`Could not infer discord invite code from ${source.source_url}`);
      skippedSources.push(source.source_url);
      continue;
    }

    let invitePayload: DiscordInviteResponse;
    try {
      invitePayload = await fetchDiscordJson<DiscordInviteResponse>(token, `/invites/${inviteCode}?with_counts=true&with_expiration=true`);
    } catch (error) {
      warnings.push(`Discord invite lookup failed for ${inviteCode}: ${error instanceof Error ? error.message : "unknown_error"}`);
      skippedSources.push(source.source_url);
      continue;
    }

    const guildId = invitePayload.guild?.id;
    const guildName = invitePayload.guild?.name ?? inviteCode;
    if (!guildId) {
      warnings.push(`Discord invite ${inviteCode} did not expose a guild id.`);
      skippedSources.push(source.source_url);
      continue;
    }

    let channels: DiscordChannel[];
    try {
      channels = await fetchDiscordJson<DiscordChannel[]>(token, `/guilds/${guildId}/channels`);
    } catch (error) {
      warnings.push(`Discord channel discovery failed for ${guildName}: ${error instanceof Error ? error.message : "unknown_error"}`);
      skippedSources.push(source.source_url);
      continue;
    }

    const candidateChannels = channels
      .filter((channel) => channel.type === 0)
      .map((channel) => ({ channel, score: scoreChannelCandidate(channel) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .map((item) => item.channel);

    if (candidateChannels.length === 0) {
      warnings.push(`No suitable discussion channels were identified for ${guildName}.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const sampledChannelIds: string[] = [];
    for (const channel of candidateChannels) {
      try {
        const messages = await fetchDiscordJson<DiscordMessage[]>(token, `/channels/${channel.id}/messages?limit=100`);
        const insertedCount = insertDiscordMessagesIntoBuffer(db, guildId, guildName, channel.id, channel.name, messages);
        if (insertedCount > 0) {
          sampledChannelIds.push(channel.id);
        }
      } catch (error) {
        warnings.push(`Discord message read failed for ${guildName} / ${channel.name}: ${error instanceof Error ? error.message : "unknown_error"}`);
      }
    }

    if (sampledChannelIds.length === 0) {
      warnings.push(`Discord bot could not read any candidate discussion channels for ${guildName}.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const requestedWindowHours = source.requested_window_hours ?? 72;
    const bufferedMessages = readBufferedDiscordMessages(db, guildId, sampledChannelIds, requestedWindowHours);
    if (bufferedMessages.length === 0) {
      warnings.push(`Discord buffer currently has no readable messages for ${guildName} in the requested ${requestedWindowHours}h window.`);
      skippedSources.push(source.source_url);
      continue;
    }

    const totalMessages = bufferedMessages.length;
    const uniqueAuthors = new Set(bufferedMessages.map((message) => message.authorId ?? message.authorLabel)).size;
    const authorCounts = new Map<string, number>();
    const textCounts = new Map<string, number>();
    const channelCounts = new Map<string, number>();
    for (const message of bufferedMessages) {
      const authorKey = message.authorId ?? message.authorLabel;
      authorCounts.set(authorKey, (authorCounts.get(authorKey) ?? 0) + 1);
      textCounts.set(message.text.toLowerCase(), (textCounts.get(message.text.toLowerCase()) ?? 0) + 1);
      channelCounts.set(message.channelName, (channelCounts.get(message.channelName) ?? 0) + 1);
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

    const guildKeywords = guildName
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .filter((tokenPart) => tokenPart.length >= 2);
    const projectKeywords = Array.from(
      new Set([...guildKeywords, "token", "launch", "tge", "listing", "roadmap", "staking", "airdrop", "endless"])
    );
    const projectRelevantMessages = contentBearingMessages.filter((message) => keywordMatch(message.text, projectKeywords));
    const questionMessages = contentBearingMessages.filter(
      (message) => /\?$/.test(message.text) || /^(how|what|when|why|wen|where)\b/i.test(message.text)
    );
    const offTopicMessages = contentBearingMessages.filter(
      (message) => !keywordMatch(message.text, projectKeywords) && message.text.length <= 20
    );

    const timestamps = bufferedMessages.map((message) => new Date(message.sentAt).getTime() / 1000).sort((a, b) => a - b);
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
            (uniqueAuthors >= 10 ? 0.8 : -0.6) +
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

    const topChannels = Array.from(channelCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);

    const keyFindings: string[] = [
      `当前窗口内读取到 ${totalMessages} 条消息，覆盖 ${uniqueAuthors} 名发言用户。`,
      `本次纳入分析的频道数：${sampledChannelIds.length}。`,
      topChannels.length > 0 ? `主要活跃频道：${topChannels.join("、")}。` : "未识别到主要活跃频道。"
    ];
    if (topSpeakersShare !== null) {
      keyFindings.push(`前 10 名发言者占比 ${Math.round(topSpeakersShare * 100)}%。`);
    }
    if (effectiveWindowHours < requestedWindowHours) {
      keyFindings.push(`当前仅覆盖约 ${effectiveWindowHours} 小时有效消息窗口，尚未达到请求的 ${requestedWindowHours} 小时。`);
    }

    const overallStatus =
      botRiskScore >= 7 ? "high_risk" : discussionEffectivenessScore >= 6 && activityQualityScore >= 6 ? "healthy" : "moderate";

    const result = upsertCommunityEvidence(db, {
      taskId,
      sourceId: source.id,
      sourceType: "discord",
      collectorKey: "discord_bot_ingestion",
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
          title: `${guildName} 项目相关样本`,
          summary: "命中项目关键词、路线图、TGE、产品或文档讨论的消息样本。",
          itemCount: projectRelevantMessages.length,
          sampleMessages: sampleUnique(projectRelevantMessages, 5, (item) => `${item.authorLabel}-${item.externalMessageId}`).map((item) => ({
            author: `${item.authorLabel} @ ${item.channelName}`,
            text: item.text,
            sentAt: item.sentAt
          }))
        },
        {
          bucket: "qa_interactions",
          title: `${guildName} 问答互动样本`,
          summary: "带明显提问或互动承接的消息样本。",
          itemCount: questionMessages.length,
          sampleMessages: sampleUnique(questionMessages, 5, (item) => `${item.authorLabel}-${item.externalMessageId}`).map((item) => ({
            author: `${item.authorLabel} @ ${item.channelName}`,
            text: item.text,
            sentAt: item.sentAt
          }))
        },
        {
          bucket: "repeated_messages",
          title: `${guildName} 重复文本样本`,
          summary: "高重复或模板化文本样本，用于辅助判断异常活跃与任务盘痕迹。",
          itemCount: repeatedMessages.length,
          sampleMessages: sampleUnique(
            repeatedContentMessages.length > 0 ? repeatedContentMessages : repeatedMessages,
            5,
            (item) => `${item.authorLabel}-${item.externalMessageId}`
          ).map((item) => ({
            author: `${item.authorLabel} @ ${item.channelName}`,
            text: item.text,
            sentAt: item.sentAt
          }))
        },
        {
          bucket: "baseline_random",
          title: `${guildName} 常规活跃样本`,
          summary: "当前窗口内的常规随机消息样本。",
          itemCount: totalMessages,
          sampleMessages: sampleUnique(baselineSamplePool, 5, (item) => `${item.authorLabel}-${item.externalMessageId}`).map((item) => ({
            author: `${item.authorLabel} @ ${item.channelName}`,
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

  return {
    taskId,
    collectedSources,
    skippedSources,
    warnings,
    evidenceCount
  };
};
