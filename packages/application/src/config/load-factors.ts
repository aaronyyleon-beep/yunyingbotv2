import path from "node:path";
import { loadJsonFile } from "./load-json-file.js";

interface FactorConfigEntry {
  factor_key: string;
  factor_name: string;
  description: string;
  expected_evidence_types: string[];
}

interface FactorDimensionConfig {
  dimension_key: string;
  dimension_name: string;
  factors: FactorConfigEntry[];
}

interface FactorsConfigFile {
  version: string;
  dimensions: FactorDimensionConfig[];
}

export const loadFactorsConfig = (repoRoot: string): FactorsConfigFile =>
  loadJsonFile<FactorsConfigFile>(path.join(repoRoot, "configs/factors/factors.v1.json"));
