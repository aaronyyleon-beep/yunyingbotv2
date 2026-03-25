import { existsSync } from "node:fs";
import { loadRepoEnv } from "../config/load-env.js";

const DEFAULT_WINDOWS_BROWSER_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];

export const resolveBrowserExecutablePath = (repoRoot: string): string | null => {
  const env = loadRepoEnv(repoRoot);
  const fromEnv = env.BROWSER_EXECUTABLE_PATH?.trim();

  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const detected = DEFAULT_WINDOWS_BROWSER_PATHS.find((candidate) => existsSync(candidate));
  return detected ?? null;
};
