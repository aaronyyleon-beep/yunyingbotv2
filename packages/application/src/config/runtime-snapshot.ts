import { existsSync } from "node:fs";
import path from "node:path";
import type { RuntimeSnapshot } from "@yunyingbot/shared";
import { getProviderCatalog } from "../collection/provider-catalog.js";
import { loadCommunityBotRuntimeConfig } from "./community-bot-config.js";

const requiredFiles = [
  "configs/factors/factors.v1.json",
  "configs/dimensions/dimensions.v1.json",
  "configs/workflows/analysis-workflow.v1.json",
  "configs/scoring/scoring.v1.json",
  "data/samples/sample-project-input.json"
];

export const loadRuntimeSnapshot = (repoRoot: string): RuntimeSnapshot => {
  const missingFiles = requiredFiles.filter((relativePath) => !existsSync(path.join(repoRoot, relativePath)));
  const botConfig = loadCommunityBotRuntimeConfig(repoRoot);
  const botWarnings = [
    !botConfig.telegram.tokenConfigured ? "Telegram bot token is not configured." : null,
    botConfig.telegram.tokenConfigured && !botConfig.telegram.usernameConfigured
      ? "Telegram bot username is not configured yet."
      : null,
    !botConfig.discord.tokenConfigured ? "Discord bot token is not configured." : null,
    botConfig.discord.tokenConfigured && !botConfig.discord.applicationIdConfigured
      ? "Discord application id is not configured yet."
      : null
  ].filter((value): value is string => Boolean(value));

  return {
    generatedAt: new Date().toISOString(),
    capabilities: getProviderCatalog(repoRoot),
    warnings: [
      ...missingFiles.map((relativePath) => `Missing required file: ${relativePath}`),
      ...botWarnings,
      "Telegram and Discord collection remain gated by real bot presence, permissions, privacy mode, and target-group access; Twitter and on-chain collection expose only their explicitly implemented public, browser, or minimal paths."
    ]
  };
};
