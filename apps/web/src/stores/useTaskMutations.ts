import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  CollectionActionResult,
  CollectionRun,
  FactorDetail,
  FinalAnalysisReport,
  ReportView,
  SourceDetail,
  TaskSnapshot,
  TaskSource,
  TaskSummary,
  VersionDetail
} from "../types/workflow";

const normalizeContractList = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

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

const fileToBase64 = async (file: File) =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("file_read_failed"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });

type UseTaskMutationsArgs = {
  selectedTaskId: string | null;
  selectedFactorId: string | null;
  selectedSourceId: string | null;
  freshlyCollectedTaskIds: Set<string>;
  sourceConfigDirty: boolean;
  reviewer: string;
  overrideScore: string;
  factSupplement: string;
  overrideReason: string;
  activeActionPath: string | null;
  isCreatingTask: boolean;
  isSyncingSources: boolean;
  websiteInput: string;
  docsInput: string;
  twitterInput: string;
  telegramInput: string;
  discordInput: string;
  chainInput: string;
  contractInput: string;
  notesInput: string;
  whitepaperFile: File | null;
  sourceDraftKeyFromInputs: string;
  setActiveActionPath: Dispatch<SetStateAction<string | null>>;
  setActionState: Dispatch<SetStateAction<string | null>>;
  setLastCollectionResult: Dispatch<SetStateAction<CollectionActionResult | null>>;
  setTwitterQueueAtByTask: Dispatch<SetStateAction<Record<string, string>>>;
  setFreshlyCollectedTaskIds: Dispatch<SetStateAction<Set<string>>>;
  setIsCreatingTask: Dispatch<SetStateAction<boolean>>;
  setIsSyncingSources: Dispatch<SetStateAction<boolean>>;
  setWhitepaperFile: Dispatch<SetStateAction<File | null>>;
  setWhitepaperInputKey: Dispatch<SetStateAction<number>>;
  setSourceSyncBaselineByTask: Dispatch<SetStateAction<Record<string, string>>>;
  setSourceDraftHydratedByTask: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  setTasks: Dispatch<SetStateAction<TaskSummary[]>>;
  setSnapshot: Dispatch<SetStateAction<TaskSnapshot | null>>;
  setReport: Dispatch<SetStateAction<ReportView | null>>;
  setFinalReport: Dispatch<SetStateAction<FinalAnalysisReport | null>>;
  setSources: Dispatch<SetStateAction<TaskSource[]>>;
  setSourceDataTaskId: Dispatch<SetStateAction<string | null>>;
  setRuns: Dispatch<SetStateAction<CollectionRun[]>>;
  setSelectedFactorId: Dispatch<SetStateAction<string | null>>;
  setSelectedSourceId: Dispatch<SetStateAction<string | null>>;
  setSelectedVersionId: Dispatch<SetStateAction<string | null>>;
  setFactorDetail: Dispatch<SetStateAction<FactorDetail | null>>;
  setSourceDetail: Dispatch<SetStateAction<SourceDetail | null>>;
  setVersionDetail: Dispatch<SetStateAction<VersionDetail | null>>;
  refreshSelectedTask: (taskId: string) => Promise<void>;
  refreshTasks: (options?: { loadHistory?: boolean }) => Promise<void>;
};

export function useTaskMutations(args: UseTaskMutationsArgs) {
  return useMemo(() => {
    const runAction = async (label: string, path: string) => {
      if (!args.selectedTaskId) return;
      if (path !== "analyze-factors" && args.sourceConfigDirty) {
        args.setActionState("来源配置已修改但尚未同步到当前任务。请先点击“同步来源到当前任务”，再执行采集。");
        return;
      }
      if (path === "analyze-factors" && !args.freshlyCollectedTaskIds.has(args.selectedTaskId)) {
        args.setActionState("请先对当前任务执行至少一次采集，再运行分析，避免直接使用历史数据。");
        return;
      }
      args.setActiveActionPath(path);
      args.setActionState(label);
      try {
        const response = await fetch(`/tasks/${args.selectedTaskId}/${path}`, { method: "POST" });
        const result = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(typeof result.message === "string" ? result.message : typeof result.error === "string" ? result.error : "unknown_error");
        }
        if (path === "collect-twitter-browser") {
          args.setLastCollectionResult(null);
          args.setTwitterQueueAtByTask((current) => ({ ...current, [args.selectedTaskId as string]: new Date().toISOString() }));
        } else if (path !== "analyze-factors") {
          const collectionResult = normalizeCollectionResult(result);
          args.setLastCollectionResult(collectionResult);
          args.setFreshlyCollectedTaskIds((current) => {
            const next = new Set(current);
            if (collectionResult.evidenceCount > 0) {
              next.add(args.selectedTaskId as string);
            }
            return next;
          });
        }
        await args.refreshSelectedTask(args.selectedTaskId);
        await args.refreshTasks();
        if (path === "collect-twitter-browser") {
          args.setActionState("Twitter 浏览器采集任务已入队，Worker 正在异步处理。请稍后刷新采集记录。");
        } else {
          args.setActionState(`${label.replace("正在", "").replace("...", "")}已刷新。`);
        }
      } catch (error) {
        args.setActionState(`${label.replace("正在", "").replace("...", "")}失败：${error instanceof Error ? error.message : "unknown_error"}`);
      } finally {
        args.setActiveActionPath(null);
      }
    };

    const handleReviewFactor = async () => {
      if (!args.selectedTaskId || !args.selectedFactorId) return;
      args.setActionState("正在提交人工复核...");
      await fetch(`/tasks/${args.selectedTaskId}/review-factor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId: args.selectedFactorId,
          reviewer: args.reviewer,
          overrideScore: Number(args.overrideScore),
          factSupplement: args.factSupplement,
          overrideReason: args.overrideReason
        })
      });
      await args.refreshSelectedTask(args.selectedTaskId);
      await args.refreshTasks();
      args.setActionState("人工复核已生效。");
    };

    const handleDiscoverLpCandidates = async () => {
      if (!args.selectedTaskId || !args.selectedSourceId) return;
      args.setActionState("正在检索相关 LP 候选...");
      const response = await fetch(`/tasks/${args.selectedTaskId}/sources/${args.selectedSourceId}/discover-lp-candidates`, {
        method: "POST"
      });
      const payload = (await response.json()) as { warnings?: string[]; candidates?: Array<{ lpAddress: string }> };
      args.setLastCollectionResult({
        warnings: payload.warnings ?? [],
        evidenceCount: 0,
        collectedSources: (payload.candidates ?? []).map((item) => item.lpAddress),
        skippedSources: []
      });
      await args.refreshSelectedTask(args.selectedTaskId);
      args.setActionState("LP 候选已刷新。");
    };

    const handleLpCandidateAction = async (candidateId: string, action: "confirm" | "ignore") => {
      if (!args.selectedTaskId) return;
      args.setActionState(action === "confirm" ? "正在确认 LP 候选..." : "正在忽略 LP 候选...");
      await fetch(`/tasks/${args.selectedTaskId}/lp-candidates/${candidateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      await args.refreshSelectedTask(args.selectedTaskId);
      await args.refreshTasks();
      args.setActionState(action === "confirm" ? "LP 候选已确认。" : "LP 候选已忽略。");
    };

    const handleCreateTask = async () => {
      if (args.isCreatingTask) return;
      const hasAnySourceInput =
        Boolean(args.websiteInput.trim()) ||
        Boolean(args.docsInput.trim()) ||
        Boolean(args.twitterInput.trim()) ||
        Boolean(args.telegramInput.trim()) ||
        Boolean(args.discordInput.trim()) ||
        normalizeContractList(args.contractInput).length > 0 ||
        Boolean(args.whitepaperFile);
      if (!hasAnySourceInput) {
        args.setActionState("请先在 Step 1 填写至少一个来源（URL/合约/PDF），再创建任务。");
        return;
      }
      args.setIsCreatingTask(true);
      try {
        args.setActionState("正在创建分析任务...");
        const payload = {
          disableDedupe: true,
          inputs: [
            { type: "url", value: args.websiteInput },
            { type: "url", value: args.docsInput },
            { type: "url", value: args.twitterInput },
            { type: "url", value: args.telegramInput },
            { type: "url", value: args.discordInput },
            { type: "text", value: `chain:${args.chainInput}` },
            ...normalizeContractList(args.contractInput).map((value) => ({ type: "contract" as const, value })),
            { type: "text", value: args.notesInput }
          ].filter((item) => item.value.trim())
        };
        const created = (await fetch("/tasks/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => response.json())) as {
          taskId: string;
          deduped?: boolean;
          dedupeWindowMinutes?: number;
        };

        if (args.whitepaperFile) {
          args.setActionState("正在上传 Whitepaper PDF...");
          const contentBase64 = await fileToBase64(args.whitepaperFile);
          const uploadResponse = await fetch(`/tasks/${created.taskId}/upload-whitepaper-document`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: args.whitepaperFile.name,
              mimeType: args.whitepaperFile.type || "application/pdf",
              contentBase64
            })
          });
          if (!uploadResponse.ok) {
            const message = await uploadResponse.text();
            throw new Error(`whitepaper_upload_failed:${message}`);
          }
          args.setWhitepaperFile(null);
          args.setWhitepaperInputKey((current) => current + 1);
        }

        await args.refreshTasks();
        args.setSelectedTaskId(created.taskId);
        args.setSourceSyncBaselineByTask((current) => ({ ...current, [created.taskId]: args.sourceDraftKeyFromInputs }));
        args.setSourceDraftHydratedByTask((current) => ({ ...current, [created.taskId]: true }));
        args.setActionState(
          [
            created.deduped
              ? `命中防重复规则：已复用最近 ${created.dedupeWindowMinutes ?? 10} 分钟内同名任务。`
              : "新任务已创建。",
            args.whitepaperFile ? `已附加 Whitepaper PDF：${args.whitepaperFile.name}。` : null
          ]
            .filter(Boolean)
            .join(" ")
        );
      } finally {
        args.setIsCreatingTask(false);
      }
    };

    const handleDeleteTask = async (taskId: string) => {
      const confirmed = window.confirm("删除后该任务的分析结果、证据、报告、复核和版本记录都会一并移除。确认删除吗？");
      if (!confirmed) return;

      args.setActionState("正在删除任务...");
      await fetch(`/tasks/${taskId}`, { method: "DELETE" });
      const payload = (await fetch("/tasks").then((response) => response.json())) as {
        items: Array<{ id: string; project_name: string; final_score: number | null; review_status: string; risk_level: string | null }>;
      };
      args.setTasks(payload.items);

      if (args.selectedTaskId === taskId) {
        args.setSelectedTaskId(payload.items[0]?.id ?? null);
        if (payload.items.length === 0) {
          args.setSnapshot(null);
          args.setReport(null);
          args.setFinalReport(null);
          args.setSources([]);
          args.setSourceDataTaskId(null);
          args.setRuns([]);
          args.setSelectedFactorId(null);
          args.setSelectedSourceId(null);
          args.setSelectedVersionId(null);
          args.setFactorDetail(null);
          args.setSourceDetail(null);
          args.setVersionDetail(null);
        }
      }

      args.setActionState("任务已删除。");
      args.setSourceSyncBaselineByTask((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      args.setSourceDraftHydratedByTask((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      args.setTwitterQueueAtByTask((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      args.setFreshlyCollectedTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    };

    const handleSyncSourcesToTask = async () => {
      if (!args.selectedTaskId || args.isSyncingSources) {
        return;
      }

      args.setIsSyncingSources(true);
      try {
        args.setActionState("正在同步来源到当前任务...");
        const response = await fetch(`/tasks/${args.selectedTaskId}/sync-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            websiteUrl: args.websiteInput,
            docsUrl: args.docsInput,
            twitterUrl: args.twitterInput,
            telegramUrl: args.telegramInput,
            discordUrl: args.discordInput,
            contracts: normalizeContractList(args.contractInput),
            chain: args.chainInput
          })
        });
        const payload = (await response.json()) as { message?: string; updatedCount?: number; error?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? payload.error ?? "sync_sources_failed");
        }
        args.setFreshlyCollectedTaskIds((current) => {
          const next = new Set(current);
          next.delete(args.selectedTaskId as string);
          return next;
        });
        args.setSourceSyncBaselineByTask((current) => ({ ...current, [args.selectedTaskId as string]: args.sourceDraftKeyFromInputs }));
        await args.refreshSelectedTask(args.selectedTaskId);
        await args.refreshTasks();
        args.setActionState(`来源同步完成（${payload.updatedCount ?? 0} 条），请重新采集后再运行分析。`);
      } catch (error) {
        args.setActionState(`来源同步失败：${error instanceof Error ? error.message : "unknown_error"}`);
      } finally {
        args.setIsSyncingSources(false);
      }
    };

    return {
      runAction,
      handleReviewFactor,
      handleDiscoverLpCandidates,
      handleLpCandidateAction,
      handleCreateTask,
      handleDeleteTask,
      handleSyncSourcesToTask
    };
  }, [args]);
}
