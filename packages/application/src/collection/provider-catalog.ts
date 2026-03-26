import type { CollectionCapability } from "@yunyingbot/shared";
import { loadRepoEnv } from "../config/load-env.js";
import { resolveBrowserExecutablePath } from "./browser-runtime.js";

export const getProviderCatalog = (repoRoot: string): CollectionCapability[] => {
  const env = loadRepoEnv(repoRoot);
  const onchainConfigured = Boolean(
    env.ONCHAIN_RPC_URL?.trim() ||
      env.ONCHAIN_RPC_ETHEREUM?.trim() ||
      env.ONCHAIN_RPC_BSC?.trim() ||
      env.ONCHAIN_RPC_BASE?.trim() ||
      env.ONCHAIN_RPC_ARBITRUM?.trim() ||
      env.ONCHAIN_RPC_POLYGON?.trim() ||
      env.ONCHAIN_RPC_OPTIMISM?.trim() ||
      env.ONCHAIN_RPC_AVALANCHE?.trim()
  );
  const telegramTokenConfigured = Boolean(env.TELEGRAM_BOT_TOKEN?.trim());
  const telegramUsernameConfigured = Boolean(env.TELEGRAM_BOT_USERNAME?.trim());
  const discordTokenConfigured = Boolean(env.DISCORD_BOT_TOKEN?.trim());
  const discordApplicationConfigured = Boolean(env.DISCORD_APPLICATION_ID?.trim());
  const browserExecutable = resolveBrowserExecutablePath(repoRoot);

  return [
    {
      providerKey: "public_web_fetch",
      providerName: "Public Web Fetch",
      category: "website",
      status: "available",
      requires: [],
      notes: ["Can fetch publicly reachable websites and landing pages."]
    },
    {
      providerKey: "public_docs_fetch",
      providerName: "Public Docs Fetch",
      category: "docs",
      status: "available",
      requires: [],
      notes: ["Can fetch public docs pages and whitepaper links when reachable."]
    },
    {
      providerKey: "twitter_public_fetch",
      providerName: "Twitter Public Fetch",
      category: "twitter",
      status: "available_with_limits",
      requires: [],
      notes: [
        "Used as a fallback-only collector when browser-based Twitter capture is unavailable or insufficient.",
        "Coverage is limited and some pages or profiles may still return blocked or weak captures."
      ]
    },
    {
      providerKey: "twitter_browser_fetch",
      providerName: "Twitter Browser Fetch",
      category: "twitter",
      status: browserExecutable ? "available_with_limits" : "blocked_not_implemented",
      requires: browserExecutable ? [] : ["A local Chromium-based browser executable such as Edge or Chrome"],
      notes: [
        browserExecutable
          ? `Can attempt public Twitter page capture through a real browser using ${browserExecutable}.`
          : "No supported local browser executable was detected, so browser-based Twitter capture is unavailable."
      ]
    },
    {
      providerKey: "telegram_bot_ingestion",
      providerName: "Telegram Bot Ingestion",
      category: "telegram",
      status: telegramTokenConfigured ? "available_with_limits" : "blocked_missing_bot_access",
      requires: [
        ...(telegramTokenConfigured ? [] : ["Telegram bot token"]),
        ...(telegramUsernameConfigured ? [] : ["Telegram bot username"]),
        "Bot added to target groups or channels",
        "Privacy mode disabled when group-wide message reading is required"
      ],
      notes: telegramTokenConfigured
        ? [
            "Telegram bot token is configured locally.",
            telegramUsernameConfigured
              ? "Bot username is configured; the remaining requirement is to add the bot into the target group and disable privacy mode when needed."
              : "Bot username is not configured yet; add it to simplify setup and diagnostics."
          ]
        : ["Cannot read target group messages until a Telegram bot token is configured and the bot is added to the target group."]
    },
    {
      providerKey: "discord_bot_ingestion",
      providerName: "Discord Bot Ingestion",
      category: "discord",
      status: discordTokenConfigured ? "available_with_limits" : "blocked_missing_bot_access",
      requires: [
        ...(discordTokenConfigured ? [] : ["Discord bot token"]),
        ...(discordApplicationConfigured ? [] : ["Discord application id"]),
        "Bot invited to target servers or channels",
        "Message content intent enabled when message text analysis is required"
      ],
      notes: discordTokenConfigured
        ? [
            "Discord bot token is configured locally.",
            discordApplicationConfigured
              ? "Application id is configured; the remaining requirement is to invite the bot and enable the required intents."
              : "Application id is not configured yet; add it to simplify install-link generation."
          ]
        : ["Cannot read Discord messages until the bot is configured, invited, and granted the required intents."]
    },
    {
      providerKey: "onchain_rpc_provider",
      providerName: "On-chain RPC Provider",
      category: "onchain",
      status: onchainConfigured ? "available_with_limits" : "blocked_missing_credentials",
      requires: ["RPC provider credentials or reliable public RPC strategy"],
      notes: [
        onchainConfigured
          ? "An RPC URL is configured, so minimal chain existence checks can run."
          : "No chain RPC provider is configured yet, so chain collection should not be assumed available."
      ]
    },
    {
      providerKey: "search_provider",
      providerName: "Search Provider",
      category: "search",
      status: "available_with_limits",
      requires: [],
      notes: ["Search is conceptually supported, but production code should use a chosen provider instead of assuming generic search availability."]
    }
  ];
};
