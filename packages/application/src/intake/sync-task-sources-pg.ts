import type { AppDbClient } from "../db/client.js";
import {
  insertCommunitySourceContextRecord,
  insertOnchainSourceContextRecord,
  insertSourceRecord,
  updateProjectIdentity
} from "../repositories/core-task-chain-repository.js";

export type SyncTaskSourcesPayload = {
  websiteUrl?: string | null;
  docsUrl?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  discordUrl?: string | null;
  contracts?: string[];
  chain?: string | null;
};

type SourceCandidate = {
  sourceType: "website" | "docs" | "whitepaper" | "twitter" | "telegram" | "discord" | "contract";
  sourceUrl: string;
  isOfficial: boolean;
};

const normalizeChain = (chain?: string | null) => {
  const normalized = (chain ?? "").trim().toLowerCase();
  const labels: Record<string, string> = {
    ethereum: "Ethereum",
    bsc: "BNB Chain",
    base: "Base",
    arbitrum: "Arbitrum",
    polygon: "Polygon",
    optimism: "Optimism",
    avalanche: "Avalanche C-Chain"
  };
  return {
    chainKey: labels[normalized] ? normalized : "ethereum",
    chainLabel: labels[normalized] ?? "Ethereum"
  };
};

const normalizeText = (value?: string | null) => (value ?? "").trim();

const dedupeContracts = (contracts?: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of contracts ?? []) {
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const inferDocsSourceType = (value: string): "docs" | "whitepaper" => (value.toLowerCase().endsWith(".pdf") ? "whitepaper" : "docs");

const inferCommunityTargetLabel = (sourceType: "telegram" | "discord", value: string): string | null => {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (sourceType === "telegram") return parts[0] ?? null;
    if (url.hostname.includes("discord.gg")) return parts[0] ?? null;
    if (url.hostname.includes("discord.com") && parts[0] === "channels" && parts[1]) {
      // For /channels/<guildId>/<channelId>, persist guildId as target label.
      return parts[1];
    }
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
};

const inferCommunityTargetKind = (sourceType: "telegram" | "discord", value: string): string => {
  try {
    const url = new URL(value);
    if (sourceType === "telegram") {
      return url.pathname.includes("/joinchat/") ? "invite" : "group_or_channel";
    }
    if (url.hostname.includes("discord.gg")) return "invite";
    if (/\/channels\//.test(url.pathname)) return "server_channel";
    return "server";
  } catch {
    return sourceType === "telegram" ? "group_or_channel" : "server";
  }
};

const buildCandidates = (payload: SyncTaskSourcesPayload): SourceCandidate[] => {
  const candidates: SourceCandidate[] = [];
  const website = normalizeText(payload.websiteUrl);
  const docs = normalizeText(payload.docsUrl);
  const twitter = normalizeText(payload.twitterUrl);
  const telegram = normalizeText(payload.telegramUrl);
  const discord = normalizeText(payload.discordUrl);

  if (website) {
    candidates.push({ sourceType: "website", sourceUrl: website, isOfficial: true });
  }
  if (docs) {
    candidates.push({ sourceType: inferDocsSourceType(docs), sourceUrl: docs, isOfficial: true });
  }
  if (twitter) {
    candidates.push({ sourceType: "twitter", sourceUrl: twitter, isOfficial: true });
  }
  if (telegram) {
    candidates.push({ sourceType: "telegram", sourceUrl: telegram, isOfficial: true });
  }
  if (discord) {
    candidates.push({ sourceType: "discord", sourceUrl: discord, isOfficial: true });
  }
  for (const contract of dedupeContracts(payload.contracts)) {
    candidates.push({ sourceType: "contract", sourceUrl: contract, isOfficial: false });
  }

  return candidates;
};

export const syncTaskSourcesPg = async (db: AppDbClient, taskId: string, payload: SyncTaskSourcesPayload) => {
  const candidates = buildCandidates(payload);
  const chain = normalizeChain(payload.chain);

  return db.transaction(async (tx) => {
    const task = await tx.one<{ project_id: string }>(`SELECT project_id FROM analysis_tasks WHERE id = $1`, [taskId]);
    if (!task) {
      throw new Error("task_not_found");
    }

    await tx.execute(
      `DELETE FROM sources
       WHERE task_id = $1
         AND source_type = ANY($2::text[])`,
      [taskId, ["website", "docs", "whitepaper", "twitter", "telegram", "discord", "contract"]]
    );

    for (const candidate of candidates) {
      const source = await insertSourceRecord(tx, {
        projectId: task.project_id,
        taskId,
        sourceType: candidate.sourceType,
        sourceUrl: candidate.sourceUrl,
        isOfficial: candidate.isOfficial,
        accessStatus: "pending"
      });

      if (candidate.sourceType === "telegram" || candidate.sourceType === "discord") {
        await insertCommunitySourceContextRecord(tx, {
          taskId,
          sourceId: source.id,
          platform: candidate.sourceType,
          targetLabel: inferCommunityTargetLabel(candidate.sourceType, candidate.sourceUrl),
          targetKind: inferCommunityTargetKind(candidate.sourceType, candidate.sourceUrl),
          requestedWindowHours: 72,
          effectiveWindowHours: null,
          historyAccessMode: "unknown",
          botAccessStatus: "pending_bot_access"
        });
      }

      if (candidate.sourceType === "contract") {
        await insertOnchainSourceContextRecord(tx, {
          taskId,
          sourceId: source.id,
          chainKey: chain.chainKey,
          chainLabel: chain.chainLabel,
          contractRoleHint: null
        });
      }
    }

    const project = await tx.one<{ name: string }>(`SELECT name FROM projects WHERE id = $1`, [task.project_id]);
    await updateProjectIdentity(tx, {
      projectId: task.project_id,
      name: project?.name ?? "pending-project",
      officialWebsite: normalizeText(payload.websiteUrl) || null,
      officialTwitter: normalizeText(payload.twitterUrl) || null
    });

    return {
      taskId,
      updatedCount: candidates.length
    };
  });
};
