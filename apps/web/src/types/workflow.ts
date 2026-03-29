export type TaskSummary = {
  id: string;
  project_name: string;
  final_score: number | null;
  review_status: string;
  risk_level: string | null;
};

export type TaskSnapshot = {
  project: { name: string };
  summary: {
    evidenceCount: number;
    factorCount: number;
    versionCount: number;
  };
  factors: Array<{
    id: string;
    factor_name: string;
    dimension_name: string;
    final_score: number;
    status: string;
    confidence_level: string;
  }>;
  versions: Array<{
    id: string;
    version_type: string;
    created_at: string;
  }>;
};

export type ReportView = {
  report: {
    final_score: number;
    risk_level: string;
    summary: string;
    data_quality_note: string;
  } | null;
  dimensions: Array<{
    dimension_key: string;
    dimension_name: string;
    final_score: number;
  }>;
};

export type FinalAnalysisReport = {
  meta: {
    task_id: string;
    project_name: string;
    report_version_type: string;
    report_version_created_at: string | null;
    review_count: number;
  };
  execution_summary: {
    headline: string;
    final_score: number;
    risk_level: string;
    risk_level_label: string;
    top_problems: Array<{
      factor_key: string;
      factor_name: string;
      statement: string;
      supporting_reason: string;
    }>;
    positive_signals: Array<{
      factor_key: string;
      factor_name: string;
      statement: string;
    }>;
  };
  overall_assessment: {
    conclusion: string;
    data_quality_note: string;
    recommended_decision: string;
    content_domain_overview?: {
      website_page_count: number;
      docs_page_count: number;
      whitepaper_section_count: number;
      total_characters: number;
      sample_topics: string[];
      note: string;
    } | null;
  };
  dimension_overview: {
    items: Array<{
      dimension_key: string;
      dimension_name: string;
      final_score: number;
      summary: string;
      judgement: string;
    }>;
  };
  key_issues: {
    items: Array<{
      factor_key: string;
      factor_name: string;
      final_score: number | null;
      issue_statement: string;
      business_impact: string;
      risk_points: string[];
    }>;
  };
  key_evidence: {
    groups: Array<{
      source_group: string;
      items: Array<{
        evidence_type: string;
        title: string;
        summary: string;
        credibility_level: string;
        captured_at: string;
      }>;
    }>;
    content_domain_snapshot?: {
      website_page_count: number;
      docs_page_count: number;
      whitepaper_section_count: number;
      total_characters: number;
      sample_topics: string[];
      note: string;
    } | null;
  };
  conclusion_and_next_step: {
    conclusion: string;
    priority_review_areas: string[];
    retained_strengths: string[];
    strategy_entry_note: string;
  };
};

export type CollectionActionResult = {
  warnings: string[];
  evidenceCount: number;
  collectedSources: string[];
  skippedSources: string[];
};

export type TaskSource = {
  id: string;
  source_type: string;
  source_url: string;
  is_official: number;
  access_status: string;
  evidence_count: number;
  chain_key?: string | null;
  chain_label?: string | null;
  contract_role_hint?: string | null;
};

export type CollectionRun = {
  id: string;
  collector_key: string;
  source_type: string;
  status: string;
  collected_count: number;
  skipped_count: number;
  evidence_count: number;
  warnings: string[];
  created_at: string;
};

export type ChainValue = "ethereum" | "bsc" | "base" | "arbitrum" | "polygon" | "optimism" | "avalanche";

export type SourceConfigDraft = {
  website: string;
  docs: string;
  twitter: string;
  telegram: string;
  discord: string;
  contracts: string[];
  chain: ChainValue;
};

export type SourceDetail = {
  source: TaskSource & {
    created_at: string;
    updated_at: string;
  };
  communityContext: {
    platform: string;
    target_label: string | null;
    target_kind: string | null;
    requested_window_hours: number;
    effective_window_hours: number | null;
    history_access_mode: string;
    bot_access_status: string;
    created_at: string;
    updated_at: string;
  } | null;
  onchainContext: {
    chainKey: string;
    chainLabel: string;
    contractRoleHint: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  communityDetail: {
    windowSummary: {
      requestedWindowHours: number | null;
      effectiveWindowHours: number | null;
      messageCount: number | null;
      speakerCount: number | null;
      historyAccessMode: string | null;
      botAccessStatus: string | null;
    } | null;
    structureMetrics: {
      activity: {
        topSpeakersShare?: number | null;
        averageMessagesPerSpeaker?: number | null;
        burstinessScore?: number | null;
      } | null;
      repetition: {
        duplicateMessageRatio?: number | null;
        shortMessageRatio?: number | null;
        templateSignalRatio?: number | null;
        lowSignalRatio?: number | null;
      } | null;
      discussion: {
        projectRelevantRatio?: number | null;
        qaInteractionRatio?: number | null;
        offTopicRatio?: number | null;
      } | null;
    } | null;
    messageSamples: Array<{
      evidenceId: string;
      title: string | null;
      summary: string | null;
      bucket: string | null;
      itemCount: number | null;
      sampleMessages: Array<{
        author?: string | null;
        text?: string | null;
        sentAt?: string | null;
      }>;
    }>;
    qualityAssessment: {
      overallStatus: string | null;
      activityQualityScore: number | null;
      discussionEffectivenessScore: number | null;
      participationDepthScore: number | null;
      botRiskScore: number | null;
      keyFindings: string[];
    } | null;
  } | null;
  evidences: Array<{
    id: string;
    evidence_type: string;
    title: string | null;
    summary: string | null;
    credibility_level: string;
    captured_at: string;
  }>;
  twitterDetail: {
    pageStatus: string | null;
    statusReason: string | null;
    tweetQualityScore: number | null;
    commentQualityScore: number | null;
    visibleReplyCount: number | null;
    text: string | null;
    publishedAt: string | null;
    metrics: {
      replies: number | null;
      reposts: number | null;
      likes: number | null;
      bookmarks: number | null;
      views: number | null;
    } | null;
  } | null;
  onchainDetail: {
    chainLabel: string | null;
    contractRoleHint: string | null;
    latestBlock: string | null;
    balance: string | null;
    hasCode: boolean | null;
    contractProfile: {
      detectedInterfaces: string[];
      tokenMetadata: {
        name: string | null;
        symbol: string | null;
        decimals: string | null;
        totalSupply: string | null;
      };
      ownership: {
        owner: string | null;
      };
      proxy: {
        implementationAddress: string | null;
      };
    } | null;
    roleAssessment: {
      roleGuess: string | null;
      confidence: "low" | "medium" | "high" | null;
      reason: string | null;
      nextStepHint: string | null;
      analysisMode: "remote_llm" | "rule_fallback" | null;
    } | null;
    codeFeatures: {
      bytecodeLength: number | null;
      selectorCount: number | null;
      detectedFeatures: string[];
      matchedSelectors: string[];
      codeShape: "standard_like" | "standard_extended" | "non_standard" | null;
      complexityHint: "low" | "medium" | "high" | null;
      featureReason: string | null;
      boundaryNote: string | null;
    } | null;
    lpCandidates: Array<{
      id: string;
      dexLabel: string;
      quoteTokenLabel: string;
      lpAddress: string;
      confidence: string;
      rationale: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  } | null;
  relatedRuns: CollectionRun[];
};

export type FactorDetail = {
  factor: {
    factor_name: string;
    score_reason: string;
    confidence_level: string;
    risk_points: string[];
    opportunity_points: string[];
  };
  twitter_detail: {
    page_status: string | null;
    tweet_quality_score: number | null;
    comment_quality_score: number | null;
    visible_reply_count: number | null;
    published_at: string | null;
    metrics: {
      replies: number | null;
      reposts: number | null;
      likes: number | null;
      bookmarks: number | null;
      views: number | null;
    } | null;
  } | null;
  community_detail: {
    window_summary: {
      requested_window_hours: number | null;
      effective_window_hours: number | null;
      message_count: number | null;
      speaker_count: number | null;
      history_access_mode: string | null;
      bot_access_status: string | null;
    } | null;
    structure_metrics: {
      activity: {
        topSpeakersShare?: number | null;
        averageMessagesPerSpeaker?: number | null;
        burstinessScore?: number | null;
      } | null;
      repetition: {
        duplicateMessageRatio?: number | null;
        shortMessageRatio?: number | null;
        templateSignalRatio?: number | null;
        lowSignalRatio?: number | null;
      } | null;
      discussion: {
        projectRelevantRatio?: number | null;
        qaInteractionRatio?: number | null;
        offTopicRatio?: number | null;
      } | null;
    } | null;
    quality_assessment: {
      overall_status: string | null;
      activity_quality_score: number | null;
      discussion_effectiveness_score: number | null;
      participation_depth_score: number | null;
      bot_risk_score: number | null;
      key_findings: string[];
    } | null;
  } | null;
  evidences: Array<{
    id: string;
    evidence_type: string;
    title: string | null;
    summary: string | null;
    insight_summary?: string | null;
  }>;
};

export type VersionDetail = {
  report_snapshot: {
    summary: string;
  } | null;
  dimension_snapshot: Array<{
    dimension_name: string;
    final_score: number;
  }>;
};

export type HierarchyLevel = "level2" | "level3";

export type TwitterBrowserStatus = {
  tone: "pending" | "ok" | "warn";
  label: string;
  detail: string;
};

export type FactorEvidenceGroup = {
  key: string;
  title: string;
  items: FactorDetail["evidences"];
};
