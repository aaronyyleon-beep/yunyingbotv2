import path from "node:path";
import type { OfflineAnalysisResult } from "@yunyingbot/shared";
import { loadJsonFile } from "../config/load-json-file.js";
import { getProviderCatalog } from "../collection/provider-catalog.js";

interface SampleInputFile {
  name: string;
  inputs: Array<{ type: string; value: string }>;
}

export const runOfflineAnalysis = (repoRoot: string): OfflineAnalysisResult => {
  const sample = loadJsonFile<SampleInputFile>(path.join(repoRoot, "data/samples/sample-project-input.json"));
  const providerCatalog = getProviderCatalog(repoRoot);

  const available = providerCatalog
    .filter((capability) => capability.status === "available" || capability.status === "available_with_limits")
    .map((capability) => capability.providerKey);

  const blocked = providerCatalog
    .filter((capability) => capability.status !== "available" && capability.status !== "available_with_limits")
    .map((capability) => capability.providerKey);

  return {
    sampleInputName: sample.name,
    capabilitySummary: {
      available,
      blocked
    },
    blockedCollectionRisks: providerCatalog
      .filter((capability) => capability.status !== "available" && capability.status !== "available_with_limits")
      .map((capability) => `${capability.providerName}: ${capability.notes[0]}`),
    nextBuildTargets: [
      "Wire real config loading into intake and analysis flows.",
      "Add persistence layer for tasks, sources, evidences, factors, and versions.",
      "Implement provider adapters only after concrete credentials or access paths are confirmed."
    ]
  };
};
