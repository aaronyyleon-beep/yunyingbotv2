import type { TwitterBrowserStatus } from "../../types/workflow";
import { CreateTaskButton } from "../ui/CreateTaskButton";

type StageGatePanelProps = {
  hasTask: boolean;
  hasFreshCollection: boolean;
  hasAnalysisResult: boolean;
  sourceConfigDirty: boolean;
  collectionBlockedBySourceSync: boolean;
  collectionInProgress: boolean;
  canRunAnalysis: boolean;
  canReview: boolean;
  selectedFactorId: string | null;
  isCreatingTask: boolean;
  isSyncingSources: boolean;
  currentStep: 1 | 2 | 3 | 4;
  currentStepHint: string;
  nextStepLabel: string;
  twitterBrowserStatus: TwitterBrowserStatus | null;
  handleRunNextStep: () => void;
  handleCreateTask: () => void;
  handleSyncSourcesToTask: () => void;
  refreshTasks: (options?: { loadHistory?: boolean }) => Promise<void>;
  runAction: (label: string, path: string) => Promise<void>;
  handleReviewFactor: () => Promise<void>;
};

const stepClass = (currentStep: number, step: number) => {
  if (currentStep === step) return "wizard-step is-active";
  if (currentStep > step) return "wizard-step is-done";
  return "wizard-step";
};

export function StageGatePanel(props: StageGatePanelProps) {
  const progressPercent = Math.round((props.currentStep / 4) * 100);

  return (
    <div className="stage-gate-board">
      <section className="stage-card wizard-card">
        <div className="panel-title-row">
          <p className="panel-tag">流程向导</p>
          <span className="panel-tag">{props.currentStep} / 4</span>
        </div>
        <div className="wizard-progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={props.currentStep}>
          <div className="wizard-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="muted">当前卡点：{props.currentStepHint}</p>
        <div className="stage-actions">
          <button
            type="button"
            className="submit-review"
            onClick={props.handleRunNextStep}
            disabled={props.isCreatingTask || props.isSyncingSources || props.collectionInProgress}
          >
            运行下一步：{props.nextStepLabel}
          </button>
          <button type="button" className="submit-review secondary-action" onClick={() => void props.refreshTasks({ loadHistory: true })}>
            加载历史任务
          </button>
        </div>
      </section>

      <section className={stepClass(props.currentStep, 1)}>
        <div className="panel-title-row">
          <p className="panel-tag">Step 1</p>
          <strong>任务信息</strong>
        </div>
        {props.currentStep === 1 ? (
          <>
            <p className="muted">先创建任务，再进入来源配置和采集阶段。</p>
            <div className="stage-actions">
              <CreateTaskButton
                onClick={props.handleCreateTask}
                disabled={props.isCreatingTask || props.collectionInProgress}
                loading={props.isCreatingTask}
                label="创建任务"
                loadingLabel="创建中..."
              />
            </div>
          </>
        ) : null}
      </section>

      <section className={stepClass(props.currentStep, 2)}>
        <div className="panel-title-row">
          <p className="panel-tag">Step 2</p>
          <strong>来源配置</strong>
        </div>
        {props.currentStep === 2 ? (
          <>
            <p className="muted">检测到未同步来源改动，请先同步到当前任务。</p>
            <div className="stage-actions">
              <button
                type="button"
                className="submit-review secondary-action"
                onClick={props.handleSyncSourcesToTask}
                disabled={!props.hasTask || props.isSyncingSources || props.collectionInProgress}
              >
                {props.isSyncingSources ? "同步中..." : "去同步"}
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className={stepClass(props.currentStep, 3)}>
        <div className="panel-title-row">
          <p className="panel-tag">Step 3</p>
          <strong>数据采集</strong>
        </div>
        {props.currentStep === 3 ? (
          <>
            <p className="muted">
              {props.collectionInProgress ? "采集中或队列处理中，请等待完成。" : "系统将优先执行基础采集（页面/文档）。"}
            </p>
            <div className="stage-actions">
              <button
                type="button"
                className="submit-review secondary-action"
                onClick={() => void props.runAction("正在采集公开页面...", "collect-public")}
                disabled={!props.hasTask || props.collectionInProgress || props.collectionBlockedBySourceSync || props.isSyncingSources}
              >
                采集基础来源
              </button>
            </div>
            <details className="stage-advanced">
              <summary>更多操作（手动采集）</summary>
              <div className="stage-actions stage-actions-advanced">
                <button type="button" className="submit-review secondary-action" onClick={() => void props.runAction("正在解析 Whitepaper PDF...", "collect-whitepaper-pdf")} disabled={!props.hasTask || props.collectionInProgress || props.collectionBlockedBySourceSync || props.isSyncingSources}>解析 PDF</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void props.runAction("正在通过浏览器采集 Twitter 页面...", "collect-twitter-browser")} disabled={!props.hasTask || props.collectionInProgress || props.collectionBlockedBySourceSync || props.isSyncingSources}>采集 Twitter</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void props.runAction("正在采集 Telegram 社区...", "collect-telegram")} disabled={!props.hasTask || props.collectionInProgress || props.collectionBlockedBySourceSync || props.isSyncingSources}>采集 TG</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void props.runAction("正在采集 Discord 社区...", "collect-discord")} disabled={!props.hasTask || props.collectionInProgress || props.collectionBlockedBySourceSync || props.isSyncingSources}>采集 Discord</button>
                <button type="button" className="submit-review secondary-action" onClick={() => void props.runAction("正在采集链上指标...", "collect-onchain")} disabled={!props.hasTask || props.collectionInProgress || props.collectionBlockedBySourceSync || props.isSyncingSources}>采集链上</button>
              </div>
            </details>
            {props.twitterBrowserStatus ? (
              <div className={`collector-status collector-status-${props.twitterBrowserStatus.tone}`}>
                <strong>Twitter 浏览器采集：{props.twitterBrowserStatus.label}</strong>
                <p>{props.twitterBrowserStatus.detail}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className={stepClass(props.currentStep, 4)}>
        <div className="panel-title-row">
          <p className="panel-tag">Step 4</p>
          <strong>分析与复核</strong>
        </div>
        {props.currentStep === 4 ? (
          <>
            <p className="muted">
              {!props.hasAnalysisResult
                ? "先运行分析，再进入复核。"
                : props.canReview
                  ? "分析已完成，可继续人工复核当前三级因子。"
                  : "分析已完成。"}
            </p>
            <div className="stage-actions">
              {!props.hasAnalysisResult ? (
                <button type="button" className="submit-review secondary-action" onClick={() => void props.runAction("正在运行分析...", "analyze-factors")} disabled={!props.canRunAnalysis}>
                  运行分析
                </button>
              ) : (
                <button type="button" className="submit-review secondary-action" onClick={() => void props.handleReviewFactor()} disabled={!props.canReview || !props.selectedFactorId}>
                  提交复核
                </button>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
