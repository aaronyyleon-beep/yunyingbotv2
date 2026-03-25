import { readFileSync } from "node:fs";

export const loadJsonFile = <T>(filePath: string): T => {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
};
