import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const parseEnvFile = (raw: string): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
};

export const loadRepoEnv = (repoRoot: string): Record<string, string> => {
  const filePaths = [".env.local", ".env"].map((relativePath) => path.join(repoRoot, relativePath));
  const loaded: Record<string, string> = {};

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(loaded, parseEnvFile(readFileSync(filePath, "utf8")));
  }

  return {
    ...loaded,
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  };
};
