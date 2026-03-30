import { useEffect, useMemo, useState } from "react";
import { CreateTaskButton } from "./components/ui/CreateTaskButton";
import { useTaskMutations } from "./stores/useTaskMutations";
import { useTaskWorkflowStore } from "./stores/useTaskWorkflowStore";
import type {
  ChainValue,
  CollectionActionResult,
  CollectionRun,
  FactorDetail,
  FinalAnalysisReport,
  ReportView,
  SourceConfigDraft,
  SourceDetail,
  TaskSnapshot,
  TaskSummary,
  TaskSource,
  TwitterBrowserStatus,
  VersionDetail
} from "./types/workflow";

const TASK_HIERARCHY = {
  level1: "产品基本面评估",
  level2: [
    {
      name: "产品成熟度",
      factors: ["官网完成度", "白皮书深度", "产品核心功能可用性", "链上产品落地性"]
    },
    {
      name: "社区与用户健康度",
      factors: ["Twitter 内容质量", "社区活跃质量", "有效用户迹象", "用户购买力迹象"]
    },
    {
      name: "Bot 风险",
      factors: ["Twitter 异常互动迹象", "社区机械回复迹象", "用户结构异常迹象"]
    },
    {
      name: "增长潜力",
      factors: ["叙事与市场方向匹配度", "当前活动与产品匹配度", "区域结构匹配度"]
    },
    {
      name: "交叉验证可信度",
      factors: ["项目说法与白皮书一致性", "白皮书与链上表现一致性", "社区体量与链上体量一致性"]
    },
    {
      name: "综合风险等级",
      factors: ["时间窗口风险", "团队规模风险", "预算风险"]
    }
  ]
};

const normalizeFactorName = (value: string) =>
  value
    .replace(/\s+/g, "")
    .replace("官网完成度", "官网完整度")
    .replace("有效用户迹象", "有效用户信号")
    .replace("用户购买力迹象", "用户购买力信号")
    .replace("链上产品落地性", "链上产品落地信号")
    .replace("Twitter异常互动迹象", "Twitter异常互动信号")
    .replace("社区机械回复迹象", "社区Bot/模板化信号")
    .replace("用户结构异常迹象", "用户结构异常信号")
    .replace("社区体量与链上体量一致性", "社区与链上表现一致性")
    .trim();

const scoreTone = (score: number | null) => {
  if (score === null) return "tone-neutral";
  if (score < 4) return "tone-risk";
  if (score < 7) return "tone-warn";
  return "tone-good";
};

const sourceStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    completed: "采集完成",
    partial: "部分采集",
    failed: "采集失败",
    pending: "等待采集"
  };
  return labels[status ?? ""] ?? "状态未知";
};

const twitterPageStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    valid_tweet: "推文页面有效",
    weak_capture: "已获取部分内容",
    blocked_wall: "命中登录拦截",
    profile_or_unknown: "页面识别不足"
  };
  return labels[status ?? ""] ?? "未识别";
};

const sourceTypeLabel = (sourceType?: string | null) => {
  const labels: Record<string, string> = {
    website: "官网来源",
    docs: "文档来源",
    whitepaper: "白皮书来源",
    twitter: "Twitter 来源",
    telegram: "Telegram 社区",
    discord: "Discord 社区",
    contract: "合约地址"
  };
  return labels[sourceType ?? ""] ?? sourceType ?? "未知来源";
};

const evidenceTypeLabel = (evidenceType?: string | null) => {
  const labels: Record<string, string> = {
    website_page: "官网内容",
    docs_page: "文档内容",
    whitepaper_page: "白皮书内容",
    twitter_posts: "推文内容",
    twitter_post_detail: "推文详情",
    twitter_page_assessment: "页面评估",
    twitter_page_capture: "页面采集记录",
    twitter_profile: "账号资料",
    onchain_metric: "链上指标",
    onchain_contract_profile: "合约规则探测",
    onchain_code_features: "代码特征检测",
    onchain_role_assessment: "合约角色识别",
    community_window_summary: "社区窗口摘要",
    community_structure_metrics: "社区结构指标",
    community_message_sample: "社区消息样本",
    community_quality_assessment: "社区质量评估"
  };
  return labels[evidenceType ?? ""] ?? evidenceType ?? "未知证据";
};

const collectorLabel = (collectorKey?: string | null) => {
  const labels: Record<string, string> = {
    public_web_fetch: "公开网页采集",
    whitepaper_pdf_parse: "Whitepaper PDF 解析",
    onchain_rpc_provider: "链上 RPC 采集",
    twitter_public_fetch: "Twitter 公开回退采集",
    twitter_browser_fetch: "Twitter 浏览器采集",
    telegram_bot_ingestion: "Telegram 机器人采集",
    discord_bot_ingestion: "Discord 机器人采集"
  };
  return labels[collectorKey ?? ""] ?? collectorKey ?? "未知采集器";
};

const fileToBase64 = async (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] ?? "" : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

const confidenceLabel = (confidence?: string | null) => {
  const labels: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低"
  };
  return labels[confidence ?? ""] ?? "未知";
};

const reviewStatusLabel = (reviewStatus?: string | null) => {
  const labels: Record<string, string> = {
    pending_review: "待复核",
    reviewed: "已复核",
    not_started: "未复核"
  };
  return labels[reviewStatus ?? ""] ?? reviewStatus ?? "未知";
};

const STEP3_COLLECT_SOURCE_KEYS = ["website/docs", "whitepaper", "twitter", "telegram", "discord", "chain"] as const;
type Step3CollectSourceKey = (typeof STEP3_COLLECT_SOURCE_KEYS)[number];
const DEFAULT_COLLECT_ENABLED_BY_SOURCE: Record<Step3CollectSourceKey, boolean> = {
  "website/docs": true,
  whitepaper: true,
  twitter: true,
  telegram: true,
  discord: true,
  chain: true
};

const botAccessStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    pending_bot_access: "待接入机器人",
    bot_present: "机器人已在群内",
    bot_missing_permissions: "机器人权限不足",
    bot_ready: "机器人可采集"
  };
  return labels[status ?? ""] ?? status ?? "未知";
};

const historyAccessModeLabel = (mode?: string | null) => {
  const labels: Record<string, string> = {
    historical_read: "可读取历史消息",
    live_only: "仅可监听新消息",
    partial_history: "仅可读取部分历史",
    unknown: "历史读取能力待确认"
  };
  return labels[mode ?? ""] ?? mode ?? "未知";
};

const communityBucketLabel = (bucket?: string | null) => {
  const labels: Record<string, string> = {
    repeated_messages: "高重复样本",
    project_relevant: "项目相关样本",
    qa_interactions: "问答互动样本",
    baseline_random: "常规活跃样本",
    anomaly_patterns: "异常模式样本"
  };
  return labels[bucket ?? ""] ?? bucket ?? "样本分桶";
};

const communityOverallStatusLabel = (status?: string | null) => {
  const labels: Record<string, string> = {
    healthy: "整体健康",
    moderate: "整体一般",
    abnormal: "存在异常",
    high_risk: "高风险"
  };
  return labels[status ?? ""] ?? status ?? "待评估";
};

const onchainReadinessLabel = (hasCode?: boolean | null) => {
  if (hasCode === true) return "已确认为链上合约";
  if (hasCode === false) return "当前未识别到合约代码";
  return "基础链上识别尚未完成";
};

const onchainBalanceLabel = (balance?: string | null) => {
  if (!balance || balance === "unknown") return "暂未读取";
  return balance;
};

const onchainL1Summary = (detail?: SourceDetail["onchainDetail"] | null) => {
  if (!detail) {
    return "当前来源还没有进入链上基础识别。";
  }

  if (detail.hasCode === true) {
    return "当前已完成链上 L1 基础识别：已确认这是链上合约，并完成了基础可读性检查。";
  }

  if (detail.hasCode === false) {
    return "当前已完成链上 L1 基础识别，但没有读取到合约代码，需复核链、地址或 RPC 配置是否匹配。";
  }

  return "当前仅建立了链上目标上下文，尚未形成有效的链上基础识别结果。";
};

const onchainL1BoundaryText =
  "这一层只负责确认“它是不是合约、它在哪条链、基础读取是否正常、是否有原生币余额”，暂不判断合约角色、资金流或项目级链上画像。";

const onchainRoleConfidenceLabel = (value?: "low" | "medium" | "high" | null) => {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return "--";
};

const onchainAnalysisModeLabel = (value?: "remote_llm" | "rule_fallback" | null) => {
  if (value === "remote_llm") return "规则识别 + LLM 归纳";
  if (value === "rule_fallback") return "规则识别回退";
  return "未识别";
};

const onchainCodeShapeLabel = (value?: "standard_like" | "standard_extended" | "non_standard" | null) => {
  if (value === "standard_like") return "标准型";
  if (value === "standard_extended") return "标准扩展型";
  if (value === "non_standard") return "非标准型";
  return "--";
};

const lpCandidateStatusLabel = (value?: string | null) => {
  if (value === "confirmed") return "已确认";
  if (value === "ignored") return "已忽略";
  if (value === "pending") return "待确认";
  return "未知";
};

const CHAIN_OPTIONS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "bsc", label: "BNB Chain" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "polygon", label: "Polygon" },
  { value: "optimism", label: "Optimism" },
  { value: "avalanche", label: "Avalanche C-Chain" }
] as const;

const SOURCE_SYNC_CHAIN_VALUES = new Set<string>(CHAIN_OPTIONS.map((item) => item.value));

const normalizeInputValue = (value: string) => value.trim();

const normalizeContractList = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const createSourceDraftKey = (draft: SourceConfigDraft) =>
  JSON.stringify({
    website: normalizeInputValue(draft.website),
    docs: normalizeInputValue(draft.docs),
    twitter: normalizeInputValue(draft.twitter),
    telegram: normalizeInputValue(draft.telegram),
    discord: normalizeInputValue(draft.discord),
    contracts: [...draft.contracts].map((item) => item.trim().toLowerCase()).sort(),
    chain: draft.chain
  });

const versionTypeLabel = (value?: string | null) => {
  const labels: Record<string, string> = {
    ai_initial: "AI 初版",
    human_revised: "人工修正版",
    final_confirmed: "最终确认版",
    live_current: "当前实时版"
  };
  return labels[value ?? ""] ?? value ?? "未知版本";
};

const formatMetric = (value?: number | null) => {
  if (value === null || value === undefined) return "--";
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN");
};

const formatRatio = (value?: number | null) => {
  if (value === null || value === undefined) return "--";
  return `${(value * 100).toFixed(1)}%`;
};

const groupFactorEvidencesBySource = (evidences: FactorDetail["evidences"]) => {
  const definitions = [
    {
      key: "twitter-content",
      title: "推文主体",
      test: (evidence: FactorDetail["evidences"][number]) => ["twitter_posts", "twitter_post_detail"].includes(evidence.evidence_type)
    },
    {
      key: "twitter-assessment",
      title: "页面评估与互动指标",
      test: (evidence: FactorDetail["evidences"][number]) => ["twitter_page_assessment", "twitter_page_capture"].includes(evidence.evidence_type)
    },
    {
      key: "web-docs",
      title: "官网与文档",
      test: (evidence: FactorDetail["evidences"][number]) => ["website_page", "docs_page", "whitepaper_page"].includes(evidence.evidence_type)
    },
    {
      key: "onchain",
      title: "链上指标",
      test: (evidence: FactorDetail["evidences"][number]) => evidence.evidence_type === "onchain_metric"
    },
    {
      key: "community",
      title: "社区信号",
      test: (evidence: FactorDetail["evidences"][number]) =>
        ["community_window_summary", "community_structure_metrics", "community_message_sample", "community_quality_assessment"].includes(
          evidence.evidence_type
        )
    }
  ];

  const usedIds = new Set<string>();
  const groups = definitions
    .map((definition) => {
      const items = evidences.filter((evidence) => {
        const matched = definition.test(evidence);
        if (matched) usedIds.add(evidence.id);
        return matched;
      });
      return { key: definition.key, title: definition.title, items };
    })
    .filter((group) => group.items.length > 0);

  const otherItems = evidences.filter((evidence) => !usedIds.has(evidence.id));
  if (otherItems.length > 0) {
    groups.push({ key: "other", title: "其他证据", items: otherItems });
  }

  return groups;
};

export default function App() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  const [report, setReport] = useState<ReportView | null>(null);
  const [finalReport, setFinalReport] = useState<FinalAnalysisReport | null>(null);
  const [sources, setSources] = useState<TaskSource[]>([]);
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [factorDetail, setFactorDetail] = useState<FactorDetail | null>(null);
  const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
  const [sourceDataTaskId, setSourceDataTaskId] = useState<string | null>(null);
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(null);
  const [reviewer, setReviewer] = useState("operator");
  const [overrideScore, setOverrideScore] = useState("7.5");
  const [overrideReason, setOverrideReason] = useState("Manual review adjustment");
  const [factSupplement, setFactSupplement] = useState("");
  const [actionState, setActionState] = useState<string | null>(null);
  const [lastCollectionResult, setLastCollectionResult] = useState<CollectionActionResult | null>(null);
  const [freshlyCollectedTaskIds, setFreshlyCollectedTaskIds] = useState<Set<string>>(new Set());
  const [twitterQueueAtByTask, setTwitterQueueAtByTask] = useState<Record<string, string>>({});
  const [sourceSyncBaselineByTask, setSourceSyncBaselineByTask] = useState<Record<string, string>>({});
  const [sourceDraftHydratedByTask, setSourceDraftHydratedByTask] = useState<Record<string, boolean>>({});
  const [isSyncingSources, setIsSyncingSources] = useState(false);
  const [activeActionPath, setActiveActionPath] = useState<string | null>(null);
  const [websiteInput, setWebsiteInput] = useState("");
  const [docsInput, setDocsInput] = useState("");
  const [whitepaperFile, setWhitepaperFile] = useState<File | null>(null);
  const [whitepaperInputKey, setWhitepaperInputKey] = useState(0);
  const [twitterInput, setTwitterInput] = useState("");
  const [telegramInput, setTelegramInput] = useState("");
  const [discordInput, setDiscordInput] = useState("");
  const [chainInput, setChainInput] = useState<ChainValue>("ethereum");
  const [contractInput, setContractInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [activeHierarchyLevel, setActiveHierarchyLevel] = useState<"level2" | "level3">("level2");
  const [selectedDimensionName, setSelectedDimensionName] = useState<string>(TASK_HIERARCHY.level2[0]?.name ?? "");
  const [level1Expanded, setLevel1Expanded] = useState(true);
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set(TASK_HIERARCHY.level2.map((item) => item.name)));
  const [isIntakeDraftOpen, setIsIntakeDraftOpen] = useState(false);
  const [collectEnabledBySource, setCollectEnabledBySource] = useState<Record<Step3CollectSourceKey, boolean>>(
    DEFAULT_COLLECT_ENABLED_BY_SOURCE
  );
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const sourceDraftFromInputs = useMemo<SourceConfigDraft>(
    () => ({
      website: websiteInput,
      docs: docsInput,
      twitter: twitterInput,
      telegram: telegramInput,
      discord: discordInput,
      contracts: normalizeContractList(contractInput),
      chain: chainInput
    }),
    [websiteInput, docsInput, twitterInput, telegramInput, discordInput, contractInput, chainInput]
  );
  const sourceDraftKeyFromInputs = useMemo(() => createSourceDraftKey(sourceDraftFromInputs), [sourceDraftFromInputs]);
  const sourceDraftFromTaskSources = useMemo<SourceConfigDraft>(() => {
    const findFirst = (sourceType: string) => sources.find((item) => item.source_type === sourceType)?.source_url ?? "";
    const contracts = sources
      .filter((item) => item.source_type === "contract")
      .map((item) => item.source_url.trim())
      .filter(Boolean);
    const chainCandidate = sources.find((item) => item.source_type === "contract" && item.chain_key)?.chain_key ?? "ethereum";
    const normalizedChain = (SOURCE_SYNC_CHAIN_VALUES.has(chainCandidate) ? chainCandidate : "ethereum") as ChainValue;
    return {
      website: findFirst("website"),
      docs: findFirst("whitepaper") || findFirst("docs"),
      twitter: findFirst("twitter"),
      telegram: findFirst("telegram"),
      discord: findFirst("discord"),
      contracts,
      chain: normalizedChain
    };
  }, [sources]);
  const sourceDraftKeyFromTaskSources = useMemo(() => createSourceDraftKey(sourceDraftFromTaskSources), [sourceDraftFromTaskSources]);

  const fetchJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url);
    return (await response.json()) as T;
  };

  const fetchJsonOrNull = async <T,>(url: string): Promise<T | null> => {
    const response = await fetch(url);
    if (response.status === 404) {
      return null;
    }
    return (await response.json()) as T;
  };

  const normalizeCollectionResult = (payload: Record<string, unknown>): CollectionActionResult => ({
    warnings: Array.isArray(payload.warnings) ? (payload.warnings as string[]) : [],
    evidenceCount: typeof payload.evidenceCount === "number" ? payload.evidenceCount : 0,
    collectedSources: Array.isArray(payload.collectedSources)
      ? (payload.collectedSources as string[])
      : Array.isArray(payload.collectedContracts)
        ? (payload.collectedContracts as string[])
        : [],
    skippedSources: Array.isArray(payload.skippedSources)
      ? (payload.skippedSources as string[])
      : Array.isArray(payload.skippedContracts)
        ? (payload.skippedContracts as string[])
        : []
  });

  const refreshTasks = async (options?: { loadHistory?: boolean }) => {
    const payload = await fetchJson<{ items: TaskSummary[] }>("/tasks");
    setTasks(payload.items);
    if (options?.loadHistory) {
      setHistoryLoaded(true);
    }
    setSelectedTaskId((current) =>
      current && payload.items.some((item) => item.id === current) ? current : null
    );
  };

  const refreshSelectedTask = async (taskId: string) => {
    const [snapshotPayload, reportPayload, finalReportPayload, sourcesPayload, runsPayload] = (await Promise.all([
      fetchJson<TaskSnapshot>(`/tasks/${taskId}`),
      fetchJsonOrNull<ReportView>(`/tasks/${taskId}/report`),
      fetchJsonOrNull<FinalAnalysisReport>(`/tasks/${taskId}/final-analysis-report`),
      fetchJson<{ items: TaskSource[] }>(`/tasks/${taskId}/sources`),
      fetchJson<{ items: CollectionRun[] }>(`/tasks/${taskId}/collection-runs`)
    ])) as [TaskSnapshot, ReportView | null, FinalAnalysisReport | null, { items: TaskSource[] }, { items: CollectionRun[] }];

    setSnapshot(snapshotPayload);
    setReport(reportPayload);
    setFinalReport(finalReportPayload);
    setSources(sourcesPayload.items);
    setSourceDataTaskId(taskId);
    setRuns(runsPayload.items);
    // Sync fresh evidence gate from backend — fixes historical tasks and page-refresh state loss
    if (!twitterQueueAtByTask[taskId]) {
      setFreshlyCollectedTaskIds((current) => {
        const next = new Set(current);
        if (snapshotPayload.task.fresh_evidence_ready) {
          next.add(taskId);
        } else {
          next.delete(taskId);
        }
        return next;
      });
    }
    const queuedAt = twitterQueueAtByTask[taskId];
    if (queuedAt) {
      const queuedAtMs = new Date(queuedAt).getTime();
      const hasTwitterRunAfterQueue = runsPayload.items.some((run) =>
        run.collector_key === "twitter_browser_fetch" &&
        ["completed", "partial", "failed"].includes(run.status) &&
        new Date(run.created_at).getTime() >= queuedAtMs
      );
      if (hasTwitterRunAfterQueue) {
        const terminalTwitterRun = runsPayload.items
          .filter((run) => run.collector_key === "twitter_browser_fetch" && new Date(run.created_at).getTime() >= queuedAtMs)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        setFreshlyCollectedTaskIds((current) => {
          const next = new Set(current);
          if (terminalTwitterRun && ["completed", "partial"].includes(terminalTwitterRun.status) && terminalTwitterRun.evidence_count > 0) {
            next.add(taskId);
          } else {
            next.delete(taskId);
          }
          return next;
        });
        setTwitterQueueAtByTask((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
      }
    }
    setSelectedFactorId((current) =>
      snapshotPayload.factors.some((factor) => factor.id === current) ? (current ?? null) : (snapshotPayload.factors[0]?.id ?? null)
    );
    setSelectedVersionId((current) =>
      snapshotPayload.versions.some((version) => version.id === current) ? (current ?? null) : (snapshotPayload.versions[0]?.id ?? null)
    );
    setSelectedSourceId((current) =>
      sourcesPayload.items.some((source) => source.id === current) ? (current ?? null) : (sourcesPayload.items[0]?.id ?? null)
    );
  };

  useEffect(() => {
    if (!selectedTaskId) return;
    void refreshSelectedTask(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (sourceDataTaskId !== selectedTaskId) return;
    if (sourceDraftHydratedByTask[selectedTaskId]) return;
    setWebsiteInput(sourceDraftFromTaskSources.website);
    setDocsInput(sourceDraftFromTaskSources.docs);
    setTwitterInput(sourceDraftFromTaskSources.twitter);
    setTelegramInput(sourceDraftFromTaskSources.telegram);
    setDiscordInput(sourceDraftFromTaskSources.discord);
    setChainInput(sourceDraftFromTaskSources.chain);
    setContractInput(sourceDraftFromTaskSources.contracts.join("\n"));
    setSourceSyncBaselineByTask((current) => ({ ...current, [selectedTaskId]: sourceDraftKeyFromTaskSources }));
    setSourceDraftHydratedByTask((current) => ({ ...current, [selectedTaskId]: true }));
  }, [
    selectedTaskId,
    sourceDataTaskId,
    sourceDraftHydratedByTask,
    sourceDraftFromTaskSources,
    sourceDraftKeyFromTaskSources
  ]);

  useEffect(() => {
    if (!selectedTaskId || !selectedFactorId) {
      setFactorDetail(null);
      return;
    }
    void fetchJsonOrNull<FactorDetail>(`/tasks/${selectedTaskId}/factors/${selectedFactorId}`).then((payload) => setFactorDetail(payload));
  }, [selectedTaskId, selectedFactorId]);

  useEffect(() => {
    if (!selectedTaskId || !selectedSourceId) {
      setSourceDetail(null);
      return;
    }
    void fetchJsonOrNull<SourceDetail>(`/tasks/${selectedTaskId}/sources/${selectedSourceId}`).then((payload) => setSourceDetail(payload));
  }, [selectedTaskId, selectedSourceId]);

  useEffect(() => {
    if (!selectedTaskId || !selectedVersionId) {
      setVersionDetail(null);
      return;
    }
    void fetchJsonOrNull<VersionDetail>(`/tasks/${selectedTaskId}/versions/${selectedVersionId}`).then((payload) => setVersionDetail(payload));
  }, [selectedTaskId, selectedVersionId]);

  const selectedTaskSourceBaseline = selectedTaskId ? sourceSyncBaselineByTask[selectedTaskId] : null;
  const sourceConfigDirty = Boolean(selectedTaskId)
    ? !sourceDraftHydratedByTask[selectedTaskId ?? ""] || selectedTaskSourceBaseline !== sourceDraftKeyFromInputs
    : false;

  const {
    runAction,
    handleReviewFactor,
    handleDiscoverLpCandidates,
    handleLpCandidateAction,
    handleCreateTask,
    handleDeleteTask,
    handleSyncSourcesToTask
  } = useTaskMutations({
    selectedTaskId,
    selectedFactorId,
    selectedSourceId,
    freshlyCollectedTaskIds,
    sourceConfigDirty,
    reviewer,
    overrideScore,
    factSupplement,
    overrideReason,
    activeActionPath,
    isCreatingTask,
    isSyncingSources,
    websiteInput,
    docsInput,
    twitterInput,
    telegramInput,
    discordInput,
    chainInput,
    contractInput,
    notesInput,
    whitepaperFile,
    sourceDraftKeyFromInputs,
    setActiveActionPath,
    setActionState,
    setLastCollectionResult,
    setTwitterQueueAtByTask,
    setFreshlyCollectedTaskIds,
    setIsCreatingTask,
    setIsSyncingSources,
    setWhitepaperFile,
    setWhitepaperInputKey,
    setSourceSyncBaselineByTask,
    setSourceDraftHydratedByTask,
    setSelectedTaskId,
    setTasks,
    setSnapshot,
    setReport,
    setFinalReport,
    setSources,
    setSourceDataTaskId,
    setRuns,
    setSelectedFactorId,
    setSelectedSourceId,
    setSelectedVersionId,
    setFactorDetail,
    setSourceDetail,
    setVersionDetail,
    refreshSelectedTask,
    refreshTasks
  });

  const handleSelectDimension = (dimensionName: string) => {
    setActiveHierarchyLevel("level2");
    setSelectedDimensionName(dimensionName);
    const factor = snapshot?.factors.find((item) => item.dimension_name === dimensionName);
    if (factor) {
      setSelectedFactorId(factor.id);
    }
  };

  const handleSelectFactor = (dimensionName: string, factorName: string) => {
    setActiveHierarchyLevel("level3");
    const candidates = (snapshot?.factors ?? []).filter((item) => item.dimension_name === dimensionName);
    const factor =
      candidates.find((item) => normalizeFactorName(item.factor_name) === normalizeFactorName(factorName)) ??
      candidates[0] ??
      null;
    if (factor) {
      setSelectedDimensionName(factor.dimension_name);
      setSelectedFactorId(factor.id);
    }
  };

  const selectedFactor = snapshot?.factors.find((item) => item.id === selectedFactorId) ?? null;
  const selectedDimensionFactors = (snapshot?.factors ?? []).filter((item) => item.dimension_name === selectedDimensionName);
  const selectableTasks = historyLoaded ? tasks : selectedTask ? [selectedTask] : [];
  const allExpanded = level1Expanded && expandedDimensions.size === TASK_HIERARCHY.level2.length;
  const workflow = useTaskWorkflowStore({
    selectedTaskId,
    freshlyCollectedTaskIds,
    runs,
    twitterQueueAtByTask,
    activeActionPath,
    sourceConfigDirty,
    finalReport,
    report,
    snapshot
  });
  const { hasTask, isTwitterQueued, collectionInProgress, collectionBlockedBySourceSync, canRunAnalysis, canReview } = workflow;
  const { hasFreshCollection, hasAnalysisResult } = workflow;
  const latestTwitterBrowserRun =
    runs
      .filter((run) => run.collector_key === "twitter_browser_fetch")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const twitterBrowserStatus: TwitterBrowserStatus | null = !hasTask
    ? null
    : isTwitterQueued || latestTwitterBrowserRun?.status === "queued"
      ? { tone: "pending", label: "已加入队列", detail: "后台 Worker 尚未开始抓取，通常会在几秒内接手。" }
      : latestTwitterBrowserRun?.status === "running"
        ? { tone: "pending", label: "抓取中", detail: "Twitter 浏览器采集正在运行，请稍候等待结果刷新。" }
        : latestTwitterBrowserRun?.status === "completed"
          ? { tone: "ok", label: "抓取完成", detail: "浏览器采集已完成，来源详情中可以查看内容和互动信号。" }
          : latestTwitterBrowserRun?.status === "partial"
            ? {
                tone: "warn",
                label: "部分完成",
                detail: latestTwitterBrowserRun.warnings[0] ?? "浏览器采集返回了部分结果，但内容质量仍有限。"
              }
            : latestTwitterBrowserRun?.status === "failed"
              ? {
                  tone: "warn",
                  label: "抓取失败",
                  detail: latestTwitterBrowserRun.warnings[0] ?? "浏览器采集未能产出有效结果。"
                }
              : null;

  const currentStep: 1 | 2 | 3 = !hasTask
    ? 1
    : sourceConfigDirty || collectionInProgress || !hasFreshCollection
      ? 2
      : 3;

  const currentStepHint = !hasTask
    ? "Step 1：请先创建任务。"
    : sourceConfigDirty
      ? "Step 2：你修改了来源但还未同步。"
      : collectionInProgress
        ? "Step 2：采集进行中，请等待完成。"
        : !hasFreshCollection
          ? "Step 2：尚未完成当前任务采集。"
          : !hasAnalysisResult
            ? "Step 3：尚未运行分析。"
            : canReview && selectedFactorId
              ? "Step 3：可提交当前三级因子复核。"
              : "Step 3：分析流程已完成，可按需复核。";
  const sourceInputsDisabled = collectionInProgress;

  const nextStepLabel = !hasTask
    ? "创建任务"
    : sourceConfigDirty
      ? "去同步"
      : collectionInProgress
        ? "等待采集完成"
        : !hasFreshCollection
          ? "采集已选来源"
          : !hasAnalysisResult
            ? "运行分析"
            : canReview && selectedFactorId
              ? "提交复核"
              : "流程完成";

  const handleRunNextStep = () => {
    if (!hasTask) {
      if (!isIntakeDraftOpen) {
        setActionState("请先点击“新建分析任务”，进入来源填写页面。");
        return;
      }
      void handleCreateTask();
      return;
    }
    if (sourceConfigDirty) {
      void handleSyncSourcesToTask();
      return;
    }
    if (collectionInProgress) {
      setActionState("当前采集任务仍在执行中，请稍后再继续下一步。");
      return;
    }
    if (!hasFreshCollection) {
      const enabledRows = sourceRunRows.filter((row) => collectEnabledBySource[row.source]);
      if (enabledRows.length === 0) {
        setActionState("请先在 Step 2 开启至少一个来源采集（是否采集=是）。");
        return;
      }
      void (async () => {
        for (const row of enabledRows) {
          await runAction(row.actionLabel, row.actionPath);
        }
        if (!selectedTaskId) return;
        try {
          const response = await fetch(`/tasks/${selectedTaskId}/collection-runs`);
          if (!response.ok) return;
          const payload = (await response.json()) as { items: CollectionRun[] };
          const hasAnyEvidence = (payload.items ?? []).some((run) => run.evidence_count > 0);
          if (!hasAnyEvidence) {
            setActionState("目前全部采集失败，请提供至少一个有效数据源后重试。");
          }
        } catch {
          // no-op: keep existing action state from individual collectors
        }
      })();
      return;
    }
    if (!hasAnalysisResult) {
      void runAction("正在运行分析...", "analyze-factors");
      return;
    }
    if (canReview && selectedFactorId) {
      void handleReviewFactor();
      return;
    }
    setActionState("当前任务流程已完成。你可以在“更多操作”里按需补采集。");
  };

  const handleStartNewTaskDraft = () => {
    setIsIntakeDraftOpen(true);
    setSelectedTaskId(null);
    setWebsiteInput("");
    setDocsInput("");
    setTwitterInput("");
    setTelegramInput("");
    setDiscordInput("");
    setChainInput("ethereum");
    setContractInput("");
    setNotesInput("");
    setWhitepaperFile(null);
    setWhitepaperInputKey((current) => current + 1);
    setActionState("已进入 Step 1 新建任务。请先填写来源，再点击“运行下一步：创建任务”。");
  };

  useEffect(() => {
    if (!selectedTaskId) return;
    setIsIntakeDraftOpen(false);
    setCollectEnabledBySource(DEFAULT_COLLECT_ENABLED_BY_SOURCE);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!(isTwitterQueued || latestTwitterBrowserRun?.status === "running")) return;
    const timer = window.setInterval(() => {
      void refreshSelectedTask(selectedTaskId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [selectedTaskId, isTwitterQueued, latestTwitterBrowserRun?.status]);

  const sourceRunRows = useMemo(() => {
    const byCollector = new Map<string, CollectionRun>();
    [...runs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach((run) => {
        if (!byCollector.has(run.collector_key)) {
          byCollector.set(run.collector_key, run);
        }
      });

    return [
      {
        source: "website/docs" as Step3CollectSourceKey,
        collector: "public_web_fetch",
        actionPath: "collect-public",
        actionLabel: "正在采集公开页面...",
        run: byCollector.get("public_web_fetch") ?? null
      },
      {
        source: "whitepaper" as Step3CollectSourceKey,
        collector: "whitepaper_pdf_parse",
        actionPath: "collect-whitepaper-pdf",
        actionLabel: "正在解析 Whitepaper PDF...",
        run: byCollector.get("whitepaper_pdf_parse") ?? null
      },
      {
        source: "twitter" as Step3CollectSourceKey,
        collector: "twitter_browser_fetch",
        actionPath: "collect-twitter-browser",
        actionLabel: "正在通过浏览器采集 Twitter 页面...",
        run: byCollector.get("twitter_browser_fetch") ?? null
      },
      {
        source: "telegram" as Step3CollectSourceKey,
        collector: "telegram_bot_ingestion",
        actionPath: "collect-telegram",
        actionLabel: "正在采集 Telegram 社区...",
        run: byCollector.get("telegram_bot_ingestion") ?? null
      },
      {
        source: "discord" as Step3CollectSourceKey,
        collector: "discord_bot_ingestion",
        actionPath: "collect-discord",
        actionLabel: "正在采集 Discord 社区...",
        run: byCollector.get("discord_bot_ingestion") ?? null
      },
      {
        source: "chain" as Step3CollectSourceKey,
        collector: "onchain_rpc_provider",
        actionPath: "collect-onchain",
        actionLabel: "正在采集链上指标...",
        run: byCollector.get("onchain_rpc_provider") ?? null
      }
    ];
  }, [runs]);

  const getSourceTargetValue = (source: Step3CollectSourceKey): string => {
    if (source === "website/docs") return websiteInput;
    if (source === "twitter") return twitterInput;
    if (source === "telegram") return telegramInput;
    if (source === "discord") return discordInput;
    if (source === "chain") return chainInput;
    return "";
  };

  const setSourceTargetValue = (source: Step3CollectSourceKey, value: string) => {
    if (source === "website/docs") {
      setWebsiteInput(value);
      return;
    }
    if (source === "twitter") {
      setTwitterInput(value);
      return;
    }
    if (source === "telegram") {
      setTelegramInput(value);
      return;
    }
    if (source === "discord") {
      setDiscordInput(value);
      return;
    }
    if (source === "chain") {
      setChainInput(value as ChainValue);
    }
  };

  const getCollectionRunNote = (run: CollectionRun | null): string => {
    if (!run) {
      return "--";
    }
    const warning = run.warnings.find((item) => item.trim().length > 0);
    if (warning) {
      return warning;
    }
    if (run.status === "failed") {
      return "采集失败，但未返回明确原因。请检查来源可访问性与凭证配置。";
    }
    if (run.status === "partial") {
      return "仅部分采集成功，建议补充来源权限或调整目标链接。";
    }
    return "采集成功。";
  };

  return (
    <main className="prototype-layout">
      <aside className="panel-col left-col">
        <div className="panel-head">
          <p className="panel-title">Intelligence Console</p>
          <p className="panel-sub">Task List · Live Mode</p>
          <div className="panel-head-action">
            <CreateTaskButton
              onClick={handleStartNewTaskDraft}
              disabled={isCreatingTask}
              loading={isCreatingTask}
              active={!selectedTaskId}
              label="新建分析任务"
              loadingLabel="准备中..."
            />
          </div>
        </div>
        <div className="panel-body">
          {isIntakeDraftOpen ? (
            <button
              type="button"
              className={`task-item-card is-active`}
              onClick={handleStartNewTaskDraft}
            >
              <strong>Analysis_Task_Draft</strong>
              <span>未创建 · 草稿中</span>
            </button>
          ) : null}
          {(historyLoaded ? tasks : selectedTask ? [selectedTask] : []).map((task) => (
            <button
              key={task.id}
              type="button"
              className={`task-item-card ${selectedTaskId === task.id ? "is-active" : ""}`}
              onClick={() => {
                setIsIntakeDraftOpen(false);
                setSelectedTaskId(task.id);
              }}
            >
              <strong>{task.project_name}</strong>
              <span>{task.id.slice(0, 8)} · {task.risk_level ?? "未知"}</span>
            </button>
          ))}
          <button type="button" className="inline-link-btn" onClick={() => void refreshTasks({ loadHistory: true })}>
            加载历史任务
          </button>
        </div>
      </aside>

      <section className="panel-col center-col">
        <div className="panel-head">
          <div className="segment-nav">
            <button type="button" className="segment-btn is-active">产品基本面评估</button>
            <button type="button" className="segment-btn">策略优化</button>
            <button type="button" className="segment-btn">资源配置</button>
          </div>
          <p className="panel-title">{selectedTask?.project_name ?? "未选择任务"}</p>
          <p className="panel-sub">单主按钮流程：同步来源 / 采集 / 分析 / 复核</p>
        </div>
        <div className="panel-body">
          {!selectedTaskId && !isIntakeDraftOpen ? (
            <section className="content-card">
              <p className="section-label">创建入口</p>
              <p className="muted">中间区当前为空。点击左侧“新建分析任务”后，在这里填写数据来源并创建任务。</p>
              <div className="action-row">
                <CreateTaskButton
                  onClick={handleStartNewTaskDraft}
                  disabled={isCreatingTask}
                  loading={isCreatingTask}
                  label="新建分析任务"
                  loadingLabel="准备中..."
                />
              </div>
            </section>
          ) : (
            <>
          <section className="stage-box">
            <div className="stage-row">
              <span>Step {currentStep}/3</span>
              <span>下一步：{nextStepLabel}</span>
            </div>
            <div className="stage-track"><div className="stage-fill" style={{ width: `${Math.round((currentStep / 3) * 100)}%` }} /></div>
            <div className="step-grid">
              <div className={`step-pill ${currentStep === 1 ? "active" : currentStep > 1 ? "done" : ""}`}>Step 1 任务信息</div>
              <div className={`step-pill ${currentStep === 2 ? "active" : currentStep > 2 ? "done" : ""}`}>Step 2 数据采集</div>
              <div className={`step-pill ${currentStep === 3 ? "active" : ""}`}>Step 3 分析与复核</div>
            </div>
            <div className="blocker-box">
              <strong>当前卡点：{currentStepHint}</strong>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="workflow-btn primary"
                onClick={handleRunNextStep}
                disabled={isCreatingTask || isSyncingSources || collectionInProgress || (hasTask && sourceConfigDirty)}
              >
                运行下一步：{nextStepLabel}
              </button>
              <button type="button" className="workflow-btn" onClick={handleSyncSourcesToTask} disabled={!hasTask || isSyncingSources || collectionInProgress}>
                去同步
              </button>
            </div>
          </section>

          {currentStep === 1 ? (
            <section className="content-card">
              <p className="section-label">Step 1 · 任务信息与来源输入</p>
              <div className="source-grid">
                <label><span>website</span><input value={websiteInput} onChange={(event) => setWebsiteInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
                <label><span>docs</span><input value={docsInput} onChange={(event) => setDocsInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
                <label><span>twitter</span><input value={twitterInput} onChange={(event) => setTwitterInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
                <label><span>telegram</span><input value={telegramInput} onChange={(event) => setTelegramInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
                <label><span>discord</span><input value={discordInput} onChange={(event) => setDiscordInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
                <label><span>chain</span><select value={chainInput} onChange={(event) => setChainInput(event.target.value as ChainValue)} disabled={sourceInputsDisabled}>{CHAIN_OPTIONS.map((chain) => <option key={chain.value} value={chain.value}>{chain.label}</option>)}</select></label>
                <label className="wide"><span>contracts</span><textarea value={contractInput} onChange={(event) => setContractInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
                <label className="wide"><span>notes</span><textarea value={notesInput} onChange={(event) => setNotesInput(event.target.value)} disabled={sourceInputsDisabled} /></label>
              </div>
              <div className="action-row">
                <button type="button" className="workflow-btn" onClick={handleSyncSourcesToTask} disabled={!hasTask || isSyncingSources || collectionInProgress}>
                  {isSyncingSources ? "同步中..." : "同步来源到任务"}
                </button>
              </div>
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section className="content-card">
              <p className="section-label">Step 2 · 数据采集</p>
              <table className="run-table">
                <thead>
                  <tr><th>source</th><th>目标链接/链</th><th>是否采集</th><th>status</th><th>createdAt</th><th>evidence</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {sourceRunRows.map((row) => (
                    <tr key={row.source}>
                      <td>{row.source}</td>
                      <td>
                        {row.source === "whitepaper" ? (
                          <span className="muted">PDF 文件（Step 1 上传）</span>
                        ) : row.source === "website/docs" ? (
                          <div className="source-grid">
                            <label>
                              <span>website</span>
                              <input
                                className="step2-inline-input"
                                value={websiteInput}
                                onChange={(event) => setWebsiteInput(event.target.value)}
                                disabled={sourceInputsDisabled}
                                placeholder="website URL"
                              />
                            </label>
                            <label>
                              <span>docs</span>
                              <input
                                className="step2-inline-input"
                                value={docsInput}
                                onChange={(event) => setDocsInput(event.target.value)}
                                disabled={sourceInputsDisabled}
                                placeholder="docs/whitepaper URL"
                              />
                            </label>
                          </div>
                        ) : row.source === "chain" ? (
                          <select
                            className="step2-inline-select"
                            value={chainInput}
                            onChange={(event) => setSourceTargetValue(row.source, event.target.value)}
                            disabled={sourceInputsDisabled}
                          >
                            {CHAIN_OPTIONS.map((chain) => (
                              <option key={chain.value} value={chain.value}>{chain.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="step2-inline-input"
                            value={getSourceTargetValue(row.source)}
                            onChange={(event) => setSourceTargetValue(row.source, event.target.value)}
                            disabled={sourceInputsDisabled}
                            placeholder="填写该来源链接"
                          />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="workflow-btn"
                          onClick={() =>
                            setCollectEnabledBySource((current) => ({
                              ...current,
                              [row.source]: !current[row.source]
                            }))
                          }
                          disabled={!hasTask || collectionInProgress}
                        >
                          {collectEnabledBySource[row.source] ? "是" : "否"}
                        </button>
                      </td>
                      <td>{row.run ? sourceStatusLabel(row.run.status) : "未采集"}</td>
                      <td>{row.run ? new Date(row.run.created_at).toLocaleString("zh-CN") : "--"}</td>
                      <td>{row.run?.evidence_count ?? "--"}</td>
                      <td className={`run-note-cell ${row.run?.status ?? "none"}`}>{getCollectionRunNote(row.run)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {currentStep === 3 ? (
            <section className="content-card">
              <p className="section-label">Step 3 · 分析与复核</p>
              <div className="action-row">
                <button type="button" className="workflow-btn" onClick={() => void runAction("正在运行分析...", "analyze-factors")} disabled={!canRunAnalysis}>
                  运行因子分析
                </button>
              </div>
              <div className="kpi-row">
                <div className="kpi-card"><span>overallScore</span><strong>{report?.report?.final_score?.toFixed(1) ?? "--"}</strong></div>
                <div className="kpi-card"><span>overallLabel</span><strong>{report?.report?.risk_level ?? "--"}</strong></div>
                <div className="kpi-card"><span>recommendation</span><strong>{finalReport?.conclusion_and_next_step?.conclusion ? "watch" : "--"}</strong></div>
              </div>
            </section>
          ) : null}
            </>
          )}
        </div>
      </section>

      {currentStep === 3 ? (
      <aside className="panel-col right-col">
        <div className="panel-head">
          <p className="panel-title">人工复核</p>
          <p className="panel-sub">ReviewSubmission · human_revised</p>
        </div>
        <div className="panel-body">
          <div className="review-state-row">
            <span className="section-label">reviewStatus</span>
            <span className={`status-pill ${selectedFactor?.status === "reviewed" ? "ok" : "pending"}`}>
              {selectedFactor?.status ?? "pending_review"}
            </span>
          </div>
          <label><span>factorId</span>
            <select value={selectedFactorId ?? ""} onChange={(event) => setSelectedFactorId(event.target.value || null)}>
              {(snapshot?.factors ?? []).map((factor) => (
                <option key={factor.id} value={factor.id}>{factor.factor_name}</option>
              ))}
            </select>
          </label>
          <label><span>reviewer</span><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
          <label><span>overrideScore</span><input value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} /></label>
          <label><span>reason</span><textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label>
          <div className="action-row">
            <button type="button" className="workflow-btn" onClick={() => void handleReviewFactor()} disabled={!canReview || !selectedFactorId}>提交复核</button>
          </div>
          {actionState ? <p className="status-note">{actionState}</p> : null}
          <div className="content-card">
            <p className="section-label">执行日志</p>
            <ul className="mini-log">
              {(runs.slice(0, 4)).map((run) => (
                <li key={run.id}>
                  <strong>{sourceTypeLabel(run.source_type)}</strong> · {sourceStatusLabel(run.status)} · {new Date(run.created_at).toLocaleString("zh-CN")}
                </li>
              ))}
              {runs.length === 0 ? <li><strong>系统</strong> 初始化完成，等待“运行下一步”。</li> : null}
            </ul>
          </div>
        </div>
      </aside>
      ) : null}
    </main>
  );
}
