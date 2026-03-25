import { readFileSync } from "node:fs";
import path from "node:path";

export interface PromptTemplateBundle {
  system: string;
  task: string;
  schema: string;
}

export const loadPromptTemplate = (repoRoot: string, promptKey: string): PromptTemplateBundle => {
  const promptDir = path.join(repoRoot, "prompts", promptKey);

  return {
    system: readFileSync(path.join(promptDir, "system.md"), "utf8"),
    task: readFileSync(path.join(promptDir, "task.md"), "utf8"),
    schema: readFileSync(path.join(promptDir, "schema.json"), "utf8")
  };
};
