export type CapabilityStatus =
  | "available"
  | "available_with_limits"
  | "blocked_missing_credentials"
  | "blocked_missing_bot_access"
  | "blocked_not_implemented";

export interface CollectionCapability {
  providerKey: string;
  providerName: string;
  category: "website" | "docs" | "twitter" | "telegram" | "discord" | "onchain" | "search";
  status: CapabilityStatus;
  requires: string[];
  notes: string[];
}

export interface RuntimeSnapshot {
  generatedAt: string;
  capabilities: CollectionCapability[];
  warnings: string[];
}

export interface OfflineAnalysisResult {
  sampleInputName: string;
  capabilitySummary: {
    available: string[];
    blocked: string[];
  };
  blockedCollectionRisks: string[];
  nextBuildTargets: string[];
}

export type TaskInputType = "url" | "text" | "document";

export interface TaskInputPayload {
  type: TaskInputType;
  value: string;
}

export interface SourceCandidate {
  sourceType: "website" | "twitter" | "telegram" | "discord" | "docs" | "whitepaper" | "contract" | "unknown";
  sourceUrl: string;
  isOfficial: boolean;
}

export interface IntakeTaskResult {
  taskId: string;
  projectId: string;
  projectName: string;
  identifiedSources: SourceCandidate[];
  uncertainties: string[];
}

export interface PublicCollectionResult {
  taskId: string;
  collectedSources: string[];
  skippedSources: string[];
  warnings: string[];
  evidenceCount: number;
}

export interface AnalyzeFactorsResult {
  taskId: string;
  analyzedFactors: number;
  insufficientFactors: string[];
  dimensions: Array<{
    dimensionKey: string;
    finalScore: number;
  }>;
}
