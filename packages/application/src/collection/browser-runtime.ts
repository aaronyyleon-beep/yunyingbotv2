import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadRepoEnv } from "../config/load-env.js";

const DEFAULT_WINDOWS_BROWSER_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];

const DEFAULT_MAC_BROWSER_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

const DEFAULT_LINUX_BROWSER_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/snap/bin/chromium"
];

const findPlaywrightChromiumPath = (): string | null => {
  const roots = ["/ms-playwright", path.join(process.env.HOME ?? "", ".cache", "ms-playwright")];

  for (const root of roots) {
    if (!root || !existsSync(root)) {
      continue;
    }

    try {
      const dirs = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      for (const dir of dirs) {
        const candidate = path.join(root, dir.name, "chrome-linux", "chrome");
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    } catch {
      // ignore probing errors
    }
  }

  return null;
};

export const resolveBrowserExecutablePath = (repoRoot: string): string | null => {
  const env = loadRepoEnv(repoRoot);
  const fromEnv = env.BROWSER_EXECUTABLE_PATH?.trim();

  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const fromDedicatedEnv = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (fromDedicatedEnv && existsSync(fromDedicatedEnv)) {
    return fromDedicatedEnv;
  }

  const crossPlatformPaths = [
    ...DEFAULT_WINDOWS_BROWSER_PATHS,
    ...DEFAULT_MAC_BROWSER_PATHS,
    ...DEFAULT_LINUX_BROWSER_PATHS
  ];
  const detected = crossPlatformPaths.find((candidate) => existsSync(candidate));
  if (detected) {
    return detected;
  }

  return findPlaywrightChromiumPath();
};
