import type {
  CollectionActionResult,
  CollectionRun,
  FactorDetail,
  FactorEvidenceGroup,
  FinalAnalysisReport,
  HierarchyLevel,
  ReportView,
  TaskSnapshot
} from "../../types/workflow";

type AnalysisWorkspaceProps = {
  selectedTaskId: string | null;
  snapshot: TaskSnapshot | null;
  report: ReportView | null;
  finalReport: FinalAnalysisReport | null;
  runAction: (label: string, path: string) => Promise<void>;
  canRunAnalysis: boolean;
  hasTask: boolean;
  actionState: string | null;
  lastCollectionResult: CollectionActionResult | null;
  activeHierarchyLevel: HierarchyLevel;
  selectedDimensionName: string;
  scoreTone: (value: number | null) => string;
  evidenceTypeLabel: (value?: string | null) => string;
  selectedDimensionFactors: TaskSnapshot["factors"];
  selectedFactorId: string | null;
  setSelectedFactorId: (value: string | null) => void;
  setActiveHierarchyLevel: (value: HierarchyLevel) => void;
  runs: CollectionRun[];
  collectorLabel: (value?: string | null) => string;
  sourceStatusLabel: (value?: string | null) => string;
  sourceTypeLabel: (value?: string | null) => string;
  selectedFactor: TaskSnapshot["factors"][number] | null;
  factorDetail: FactorDetail | null;
  confidenceLabel: (value?: string | null) => string;
  groupFactorEvidencesBySource: (evidences: FactorDetail["evidences"]) => FactorEvidenceGroup[];
};

export function AnalysisWorkspace(props: AnalysisWorkspaceProps) {
  if (!props.selectedTaskId) {
    return (
      <section className="main-panel">
        <section className="empty-state-card">
          <strong>分析区暂为空</strong>
          <p className="muted">请先在左侧填写信息并点击“创建任务”，创建后这里会展示分析工作区。</p>
        </section>
      </section>
    );
  }

  return (
    <section className="main-panel">
      <header className="hero">
        <div>
          <p className="eyebrow">Analysis Workspace</p>
          <h2>{props.snapshot?.project.name ?? "Loading project..."}</h2>
        </div>
        <div className="hero-metrics">
          <div className="metric-block"><span className="metric-label">Final Score</span><strong>{props.report?.report?.final_score?.toFixed(1) ?? "--"}</strong></div>
          <div className="metric-block"><span className="metric-label">Risk</span><strong>{props.report?.report?.risk_level ?? "--"}</strong></div>
          <div className="metric-block"><span className="metric-label">Evidence</span><strong>{props.snapshot?.summary.evidenceCount ?? 0}</strong></div>
          <button
            type="button"
            className="hero-action"
            onClick={() => void props.runAction("正在运行分析...", "analyze-factors")}
            disabled={!props.canRunAnalysis}
            title={!props.hasTask ? "请先选择任务" : props.canRunAnalysis ? "运行当前任务分析" : "需先完成一次当前任务采集，且无进行中的采集"}
          >
            运行分析
          </button>
        </div>
      </header>

      {props.actionState ? <p className="action-banner">{props.actionState}</p> : null}

      {props.lastCollectionResult ? (
        <section className="panel">
          <div className="panel-title-row"><h3>本次采集结果</h3><span className="panel-tag">{props.lastCollectionResult.evidenceCount} 条证据</span></div>
          <p className="muted">成功 {props.lastCollectionResult.collectedSources.length} | 跳过 {props.lastCollectionResult.skippedSources.length}</p>
          {props.lastCollectionResult.warnings.length ? <div className="chip-row">{props.lastCollectionResult.warnings.map((warning) => <span key={warning} className="chip risk-chip">{warning}</span>)}</div> : <p className="muted">本次采集没有额外警告。</p>}
        </section>
      ) : null}

      <section className="panel-grid">
        {props.activeHierarchyLevel === "level2" ? (
          <>
            <article className="panel report-panel">
              <div className="panel-title-row">
                <h3>最终分析报告</h3>
                <span className="panel-tag">{props.selectedDimensionName}</span>
              </div>
              {props.finalReport ? (
                <div className="final-report-layout">
                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>最终分析报告</h4>
                      <span className={`score-pill ${props.scoreTone(props.finalReport.execution_summary.final_score)}`}>
                        {props.finalReport.execution_summary.final_score.toFixed(1)} / {props.finalReport.execution_summary.risk_level_label}
                      </span>
                    </div>
                    <p className="lead">{props.finalReport.execution_summary.headline}</p>
                    <p className="muted">{props.finalReport.overall_assessment.conclusion}</p>
                  </section>

                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>维度概览</h4>
                      <span className="panel-tag">{props.finalReport.dimension_overview.items.length} 个维度</span>
                    </div>
                    <div className="dimension-grid">
                      {props.finalReport.dimension_overview.items.map((dimension) => (
                        <div key={dimension.dimension_key} className="dimension-card static-card report-dimension-card">
                          <span>{dimension.dimension_name}</span>
                          <strong className={props.scoreTone(dimension.final_score)}>{dimension.final_score.toFixed(1)}</strong>
                          <p>{dimension.judgement}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {props.finalReport.overall_assessment.content_domain_overview ? (
                    <section className="report-section">
                      <div className="panel-title-row">
                        <h4>内容资料面概况</h4>
                        <span className="panel-tag">
                          {props.finalReport.overall_assessment.content_domain_overview.website_page_count +
                            props.finalReport.overall_assessment.content_domain_overview.docs_page_count +
                            props.finalReport.overall_assessment.content_domain_overview.whitepaper_section_count} 条内容快照
                        </span>
                      </div>
                      <p>{props.finalReport.overall_assessment.content_domain_overview.note}</p>
                      <div className="chip-row">
                        <span className="chip">官网 {props.finalReport.overall_assessment.content_domain_overview.website_page_count} 页</span>
                        <span className="chip">Docs {props.finalReport.overall_assessment.content_domain_overview.docs_page_count} 页</span>
                        <span className="chip">白皮书 {props.finalReport.overall_assessment.content_domain_overview.whitepaper_section_count} 段</span>
                        <span className="chip">约 {props.finalReport.overall_assessment.content_domain_overview.total_characters} 字符</span>
                      </div>
                      {props.finalReport.overall_assessment.content_domain_overview.sample_topics.length > 0 ? (
                        <div className="chip-row">
                          {props.finalReport.overall_assessment.content_domain_overview.sample_topics.map((topic) => (
                            <span key={`topic-${topic}`} className="chip neutral-chip">{topic}</span>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>关键问题汇总</h4>
                      <span className="panel-tag">{props.finalReport.key_issues.items.length} 项</span>
                    </div>
                    <div className="report-list">
                      {props.finalReport.key_issues.items.map((item) => (
                        <div key={item.factor_key} className="report-list-item">
                          <strong>{item.factor_name}</strong>
                          <p>{item.issue_statement}</p>
                          <p className="muted">{item.business_impact}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>关键证据汇总</h4>
                      <span className="panel-tag">{props.finalReport.key_evidence.groups.length} 组</span>
                    </div>
                    <div className="report-list">
                      {props.finalReport.key_evidence.groups.map((group) => (
                        <div key={group.source_group} className="report-list-item">
                          <strong>{group.source_group}</strong>
                          <div className="evidence-stack compact-stack">
                            {group.items.map((item) => (
                              <div key={`${group.source_group}-${item.title}-${item.captured_at}`} className="evidence-card">
                                <span className="evidence-type">{props.evidenceTypeLabel(item.evidence_type)}</span>
                                <strong>{item.title}</strong>
                                <p>{item.summary}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="report-section">
                    <div className="panel-title-row">
                      <h4>结论与建议入口</h4>
                      <span className="panel-tag">二级任务结论</span>
                    </div>
                    <p>{props.finalReport.conclusion_and_next_step.conclusion}</p>
                    <div className="chip-row">
                      {props.finalReport.conclusion_and_next_step.priority_review_areas.map((item) => (
                        <span key={`priority-${item}`} className="chip risk-chip">优先复核：{item}</span>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <p className="muted">当前任务还没有可用的最终分析报告，请先运行分析。</p>
              )}
            </article>

            <article className="panel factor-panel">
              <div className="panel-title-row">
                <h3>因子评估看板</h3>
                <span className="panel-tag">{props.selectedDimensionFactors.length} 个因子</span>
              </div>
              <div className="factor-list">
                {props.selectedDimensionFactors.map((factor) => (
                  <button
                    key={factor.id}
                    type="button"
                    className={`factor-row ${props.selectedFactorId === factor.id ? "is-selected" : ""}`}
                    onClick={() => {
                      props.setSelectedFactorId(factor.id);
                      props.setActiveHierarchyLevel("level3");
                    }}
                  >
                    <div>
                      <div className="factor-name">{factor.factor_name}</div>
                      <div className="factor-sub">{factor.dimension_name} · {factor.status}</div>
                    </div>
                    <strong className={props.scoreTone(factor.final_score)}>{factor.final_score.toFixed(1)}</strong>
                  </button>
                ))}
                {props.selectedDimensionFactors.length === 0 ? <p className="muted">当前维度还没有因子结果。</p> : null}
              </div>
            </article>

            <article className="panel version-panel">
              <div className="panel-title-row"><h3>采集运行记录</h3><span className="panel-tag">{props.runs.length} 条</span></div>
              <div className="version-list">
                {props.runs.map((run) => (
                  <div key={run.id} className="version-row">
                    <strong>{props.collectorLabel(run.collector_key)} · {props.sourceStatusLabel(run.status)}</strong>
                    <span>{props.sourceTypeLabel(run.source_type)} | 证据 {run.evidence_count} 条 | 成功 {run.collected_count} | 跳过 {run.skipped_count}</span>
                    {run.warnings.length ? <div className="chip-row">{run.warnings.map((warning) => <span key={warning} className="chip risk-chip">{warning}</span>)}</div> : null}
                  </div>
                ))}
              </div>
            </article>
          </>
        ) : (
          <article className="panel report-panel">
            <div className="panel-title-row">
              <h3>三级因子分析</h3>
              <span className="panel-tag">{props.selectedFactor?.factor_name ?? "未选择因子"}</span>
            </div>
            {props.factorDetail ? (
              <div className="final-report-layout">
                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>关键问题</h4>
                    <span className="panel-tag">{props.confidenceLabel(props.factorDetail.factor.confidence_level)}</span>
                  </div>
                  <p>{props.factorDetail.factor.score_reason}</p>
                  <div className="chip-row">
                    {props.factorDetail.factor.risk_points.map((item) => <span key={item} className="chip risk-chip">{item}</span>)}
                  </div>
                </section>

                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>关键证据</h4>
                    <span className="panel-tag">{props.factorDetail.evidences.length} 条</span>
                  </div>
                  <div className="evidence-stack">
                    {props.groupFactorEvidencesBySource(props.factorDetail.evidences).map((group) => (
                      <section key={group.key} className="evidence-group">
                        <div className="panel-title-row"><h5>{group.title}</h5><span className="panel-tag">{group.items.length} 条</span></div>
                        <div className="evidence-stack">
                          {group.items.map((evidence) => (
                            <div key={evidence.id} className="evidence-card">
                              <span className="evidence-type">{props.evidenceTypeLabel(evidence.evidence_type)}</span>
                              <strong>{evidence.title ?? "Untitled evidence"}</strong>
                              <p>{evidence.summary ?? "暂无摘要。"}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>

                <section className="report-section">
                  <div className="panel-title-row">
                    <h4>结论与建议入口</h4>
                    <span className="panel-tag">三级因子结论</span>
                  </div>
                  <p>
                    {(props.factorDetail.factor.risk_points[0] ?? "当前因子已完成分析，可结合关键问题继续复核。")}
                  </p>
                  <div className="chip-row">
                    {props.factorDetail.factor.opportunity_points.map((item) => <span key={item} className="chip opp-chip">{item}</span>)}
                  </div>
                </section>
              </div>
            ) : (
              <p className="muted">请选择一个三级因子查看分析内容。</p>
            )}
          </article>
        )}
      </section>
    </section>
  );
}
