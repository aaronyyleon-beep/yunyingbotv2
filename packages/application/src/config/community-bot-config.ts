import { loadRepoEnv } from "./load-env.js";

export interface CommunityBotRuntimeConfig {
  telegram: {
    tokenConfigured: boolean;
    usernameConfigured: boolean;
    username: string | null;
  };
  discord: {
    tokenConfigured: boolean;
    applicationIdConfigured: boolean;
    applicationId: string | null;
  };
}

export const loadCommunityBotRuntimeConfig = (repoRoot: string): CommunityBotRuntimeConfig => {
  const env = loadRepoEnv(repoRoot);

  return {
    telegram: {
      tokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
      usernameConfigured: Boolean(env.TELEGRAM_BOT_USERNAME?.trim()),
      username: env.TELEGRAM_BOT_USERNAME?.trim() || null
    },
    discord: {
      tokenConfigured: Boolean(env.DISCORD_BOT_TOKEN?.trim()),
      applicationIdConfigured: Boolean(env.DISCORD_APPLICATION_ID?.trim()),
      applicationId: env.DISCORD_APPLICATION_ID?.trim() || null
    }
  };
};
