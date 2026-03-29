import { useMemo } from "react";
import type { CollectionRun, FinalAnalysisReport, ReportView, TaskSnapshot } from "../types/workflow";

type WorkflowInputs = {
  selectedTaskId: string | null;
  freshlyCollectedTaskIds: Set<string>;
  runs: CollectionRun[];
  twitterQueueAtByTask: Record<string, string>;
  activeActionPath: string | null;
  sourceConfigDirty: boolean;
  finalReport: FinalAnalysisReport | null;
  report: ReportView | null;
  snapshot: TaskSnapshot | null;
};

export function useTaskWorkflowStore(inputs: WorkflowInputs) {
  return useMemo(() => {
    const hasTask = Boolean(inputs.selectedTaskId);
    const hasFreshCollection = Boolean(inputs.selectedTaskId && inputs.freshlyCollectedTaskIds.has(inputs.selectedTaskId));
    const hasRunningCollectionRun = inputs.runs.some((run) => ["queued", "running"].includes(run.status));
    const isTwitterQueued = Boolean(inputs.selectedTaskId && inputs.twitterQueueAtByTask[inputs.selectedTaskId]);
    const collectionInProgress =
      (inputs.activeActionPath !== null && inputs.activeActionPath !== "analyze-factors") || hasRunningCollectionRun || isTwitterQueued;
    const collectionBlockedBySourceSync = hasTask && inputs.sourceConfigDirty;
    const canRunAnalysis = hasTask && hasFreshCollection && !collectionInProgress && !collectionBlockedBySourceSync;
    const hasAnalysisResult = Boolean(inputs.finalReport || inputs.report?.report || (inputs.snapshot?.factors.length ?? 0) > 0);
    const canReview = hasTask && hasAnalysisResult && !collectionInProgress;

    return {
      hasTask,
      hasFreshCollection,
      hasRunningCollectionRun,
      isTwitterQueued,
      collectionInProgress,
      collectionBlockedBySourceSync,
      canRunAnalysis,
      hasAnalysisResult,
      canReview
    };
  }, [inputs]);
}
