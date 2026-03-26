import type { TaskInputPayload } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import {
  createAnalysisTaskRecord,
  createProject,
  findRecentTaskByProjectName,
  insertCommunitySourceContextRecord,
  insertOnchainSourceContextRecord,
  insertSourceRecord,
  updateProjectIdentity,
  updateTaskStatuses
} from "../repositories/core-task-chain-repository.js";

interface SourceCandidate {
  sourceType: "website" | "twitter" | "telegram" | "discord" | "whitepaper" | "docs" | "contract" | "unknown";
  sourceUrl: string;
  isOfficial: boolean;
}

const TASK_NAME_PREFIX = "Analysis_Task_";

const extractHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const inferSource = (value: string): SourceCandidate => {
  const trimmed = value.trim();

  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return { sourceType: "contract", sourceUrl: trimmed, isOfficial: false };
  }

  const hostname = extractHostname(trimmed);
  if (!hostname) {
    return { sourceType: "unknown", sourceUrl: trimmed, isOfficial: false };
  }

  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    return { sourceType: "twitter", sourceUrl: trimmed, isOfficial: true };
  }
  if (hostname.includes("t.me") || hostname.includes("telegram.me")) {
    return { sourceType: "telegram", sourceUrl: trimmed, isOfficial: true };
  }
  if (hostname.includes("discord.gg") || hostname.includes("discord.com")) {
    return { sourceType: "discord", sourceUrl: trimmed, isOfficial: true };
  }
  if (trimmed.endsWith(".pdf")) {
    return { sourceType: "whitepaper", sourceUrl: trimmed, isOfficial: true };
  }
  if (hostname.startsWith("docs.") || trimmed.includes("/docs") || trimmed.includes("gitbook")) {
    return { sourceType: "docs", sourceUrl: trimmed, isOfficial: true };
  }

  return { sourceType: "website", sourceUrl: trimmed, isOfficial: true };
};

const extractTwitterHandle = (value: string): string | null => {
  const hostname = extractHostname(value);
  if (!hostname || (!hostname.includes("twitter.com") && !hostname.includes("x.com"))) {
    return null;
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const inferProjectName = (inputs: TaskInputPayload[], candidates: SourceCandidate[]): string => {
  const websiteCandidate = candidates.find((candidate) => candidate.sourceType === "website");
  if (websiteCandidate) {
    const hostname = extractHostname(websiteCandidate.sourceUrl);
    if (hostname) {
      return hostname.replace(/^www\./, "").split(".")[0];
    }
  }

  const twitterCandidate = candidates.find((candidate) => candidate.sourceType === "twitter");
  if (twitterCandidate) {
    return extractTwitterHandle(twitterCandidate.sourceUrl) ?? "unknown-project";
  }

  const meaningfulText = inputs
    .filter((input) => input.type === "text")
    .map((input) => input.value.trim())
    .find((value) => value.length > 0 && !/^chain:/i.test(value));
  if (meaningfulText) {
    return meaningfulText.slice(0, 32).trim() || "unknown-project";
  }

  const contractCandidate = candidates.find((candidate) => candidate.sourceType === "contract");
  if (contractCandidate) {
    return `${contractCandidate.sourceUrl.slice(0, 8)}...`;
  }

  return "unknown-project";
};

const normalizeTaskNameToken = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized.length > 0) {
    return normalized.slice(0, 32);
  }
  return Date.now().toString();
};

const extractRequestedChain = (inputs: TaskInputPayload[]): string | null => {
  const chainInput = inputs
    .filter((input) => input.type === "text")
    .map((input) => input.value.trim())
    .find((value) => /^chain:/i.test(value));

  if (!chainInput) {
    return null;
  }

  return chainInput.replace(/^chain:/i, "").trim().toLowerCase() || null;
};

const normalizeChainLabel = (chainKey: string | null) => {
  const labels: Record<string, string> = {
    ethereum: "Ethereum",
    bsc: "BNB Chain",
    base: "Base",
    arbitrum: "Arbitrum",
    polygon: "Polygon",
    optimism: "Optimism",
    avalanche: "Avalanche C-Chain"
  };

  if (!chainKey) {
    return { chainKey: "ethereum", chainLabel: "Ethereum" };
  }

  return {
    chainKey,
    chainLabel: labels[chainKey] ?? chainKey
  };
};

const inferCommunityTargetLabel = (sourceType: SourceCandidate["sourceType"], value: string): string | null => {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (sourceType === "telegram") return parts[0] ?? null;
    if (sourceType === "discord") {
      if (url.hostname.includes("discord.gg")) return parts[0] ?? null;
      if (url.hostname.includes("discord.com")) return parts.at(-1) ?? null;
    }
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
};

const inferCommunityTargetKind = (sourceType: SourceCandidate["sourceType"], value: string): string | null => {
  try {
    const url = new URL(value);
    if (sourceType === "telegram") {
      return url.pathname.includes("/joinchat/") ? "invite" : "group_or_channel";
    }
    if (sourceType === "discord") {
      if (url.hostname.includes("discord.gg")) return "invite";
      if (/\/channels\//.test(url.pathname)) return "server_channel";
      return "server";
    }
    return null;
  } catch {
    return null;
  }
};

export const createAnalysisTaskPg = async (
  db: AppDbClient,
  inputs: TaskInputPayload[],
  dedupeWindowMinutes: number
) => {
  const sourceCandidates = inputs.filter((input) => input.type === "url").map((input) => inferSource(input.value));
  const inferredProjectName = inferProjectName(inputs, sourceCandidates).trim();
  const taskProjectName = `${TASK_NAME_PREFIX}${normalizeTaskNameToken(inferredProjectName)}`;
  const normalizedName = taskProjectName.toLowerCase();
  const uncertainties: string[] = [];

  if (!sourceCandidates.some((candidate) => candidate.sourceType === "website")) {
    uncertainties.push("No official website was confidently identified.");
  }

  if (
    normalizedName.length > 0 &&
    normalizedName !== "unknown-project" &&
    Number.isFinite(dedupeWindowMinutes) &&
    dedupeWindowMinutes > 0
  ) {
    const existing = await findRecentTaskByProjectName(db, normalizedName, dedupeWindowMinutes);
    if (existing) {
      return {
        taskId: existing.task_id,
        deduped: true,
        dedupeWindowMinutes,
        projectName: taskProjectName,
        reusedTaskCreatedAt: existing.created_at
      };
    }
  }

  const officialWebsite = sourceCandidates.find((candidate) => candidate.sourceType === "website")?.sourceUrl ?? null;
  const officialTwitter = sourceCandidates.find((candidate) => candidate.sourceType === "twitter")?.sourceUrl ?? null;
  const requestedChain = normalizeChainLabel(extractRequestedChain(inputs));

  const project = await createProject(db, {
    name: "pending-project",
    officialWebsite: null,
    officialTwitter: null
  });
  const task = await createAnalysisTaskRecord(db, project.id, inputs);

  await updateProjectIdentity(db, {
    projectId: project.id,
    name: taskProjectName,
    officialWebsite,
    officialTwitter
  });

  for (const candidate of sourceCandidates) {
    const source = await insertSourceRecord(db, {
      projectId: project.id,
      taskId: task.taskId,
      sourceType: candidate.sourceType,
      sourceUrl: candidate.sourceUrl,
      isOfficial: candidate.isOfficial,
      accessStatus: "pending"
    });

    if (candidate.sourceType === "telegram" || candidate.sourceType === "discord") {
      await insertCommunitySourceContextRecord(db, {
        taskId: task.taskId,
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
      await insertOnchainSourceContextRecord(db, {
        taskId: task.taskId,
        sourceId: source.id,
        chainKey: requestedChain.chainKey,
        chainLabel: requestedChain.chainLabel,
        contractRoleHint: null
      });
    }
  }

  await updateTaskStatuses(db, {
    taskId: task.taskId,
    taskStatus: "collecting"
  });

  return {
    taskId: task.taskId,
    projectId: project.id,
    projectName: taskProjectName,
    identifiedSources: sourceCandidates,
    uncertainties
  };
};
