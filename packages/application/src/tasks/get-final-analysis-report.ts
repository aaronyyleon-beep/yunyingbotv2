import type { DatabaseSync } from "node:sqlite";
import { parseJsonArray } from "./parse-json.js";

type ReportRow = {
  final_score: number;
  risk_level: string;
  summary: string;
  data_quality_note: string;
};

type DimensionRow = {
  dimension_key: string;
  dimension_name: string;
  final_score: number;
  summary: string;
};

type FactorRow = {
  id: string;
  factor_key: string;
  factor_name: string;
  dimension_key: string;
  dimension_name: string;
  status: string;
  final_score: number | null;
  score_reason: string;
  risk_points_json: string;
  opportunity_points_json: string;
  evidence_refs_json: string;
};

type EvidenceRow = {
  id: string;
  source_id: string;
  evidence_type: string;
  title: string | null;
  summary: string | null;
  credibility_level: string;
  captured_at: string;
};

type VersionMeta = {
  id: string;
  version_type: string;
  created_at: string;
};

const DIMENSION_LABELS: Record<string, string> = {
  product_maturity: "产品成熟度",
  community_user_health: "社区与用户健康度",
  bot_risk: "Bot 风险",
  growth_potential: "增长潜力",
  cross_validation: "交叉验证可信度",
  overall_risk: "综合风险等级"
};

const FACTOR_LABELS: Record<string, string> = {
  website_completeness: "官网完整度",
  whitepaper_depth: "白皮书深度",
  product_functionality: "产品功能可用性",
  onchain_product_presence: "链上产品落地信号",
  twitter_content_quality: "Twitter 内容质量",
  community_activity_quality: "社区活跃质量",
  effective_user_signals: "有效用户信号",
  user_purchasing_power_signals: "用户购买力信号",
  twitter_abnormal_engagement: "Twitter 异常互动信号",
  community_bot_patterns: "社区 Bot / 模板化信号",
  user_structure_anomaly: "用户结构异常信号",
  narrative_market_fit: "叙事与市场方向匹配度",
  campaign_product_fit: "活动与产品匹配度",
  regional_fit: "区域结构匹配度",
  claim_whitepaper_consistency: "项目说法与白皮书一致性",
  whitepaper_onchain_consistency: "白皮书与链上表现一致性",
  community_onchain_consistency: "社区与链上表现一致性",
  timeline_risk: "时间窗口风险",
  team_size_risk: "团队规模风险",
  budget_risk: "预算风险"
};

const SOURCE_GROUP_LABELS: Record<string, string> = {
  website_page: "官网 / 文档",
  docs_page: "官网 / 文档",
  whitepaper_page: "官网 / 文档",
  twitter_posts: "Twitter",
  twitter_post_detail: "Twitter",
  twitter_page_assessment: "Twitter",
  twitter_page_capture: "Twitter",
  community_window_summary: "Telegram / Discord",
  community_structure_metrics: "Telegram / Discord",
  community_message_sample: "Telegram / Discord",
  community_quality_assessment: "Telegram / Discord",
  onchain_metric: "链上"
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险"
};

const DECISION_LABELS: Record<string, string> = {
  high: "建议谨慎推进",
  medium: "建议继续观察并优先复核关键问题",
  low: "建议进入下一步策略设计"
};

const cleanReason = (value: string) => value.replace(/\s+Analysis mode: .+?\.$/, "").trim();

const summarizeDimension = (score: number): string => {
  if (score < 4) {
    return "该维度明显偏弱，已经对整体判断形成拖累。";
  }

  if (score < 7) {
    return "该维度表现中性偏弱，仍需结合关键问题继续复核。";
  }

  return "该维度相对稳健，可作为当前结论中的积极支撑项。";
};

const factorImpactText = (factor: FactorRow): string => {
  const score = factor.final_score ?? 0;

  if (score < 4) {
    return "该问题对整体判断形成明显负面影响。";
  }

  if (score < 7) {
    return "该问题对整体判断形成中性偏弱影响。";
  }

  return "该项表现相对稳定，对整体判断形成一定支撑。";
};

const overallJudgement = (riskLevel: string) => {
  if (riskLevel === "high") {
    return "当前项目整体风险偏高，不适合直接进入积极推进状态。";
  }

  if (riskLevel === "medium") {
    return "当前项目具备继续评估空间，但仍需优先处理关键风险与证据不足项。";
  }

  return "当前项目整体状态相对稳定，可进入下一步策略讨论。";
};

const conclusionText = (riskLevel: string) => {
  if (riskLevel === "high") {
    return "建议暂不直接推进，应先围绕高风险维度补证据并完成重点复核。";
  }

  if (riskLevel === "medium") {
    return "建议继续推进，但进入策略层前应先确认关键问题是否可被修正。";
  }

  return "建议进入策略层，围绕当前较强维度制定更明确的运营方案。";
};

const pickLatestVersion = (versions: VersionMeta[]) => {
  const priority = ["final_confirmed", "human_revised", "ai_initial"];

  for (const versionType of priority) {
    const hit = versions.find((item) => item.version_type === versionType);
    if (hit) {
      return hit;
    }
  }

  return versions[0] ?? null;
};

export const getFinalAnalysisReport = (db: DatabaseSync, taskId: string) => {
  const project = db
    .prepare(
      `SELECT p.name
       FROM projects p
       JOIN analysis_tasks t ON t.project_id = p.id
       WHERE t.id = ?`
    )
    .get(taskId) as { name: string } | undefined;

  const report = db
    .prepare(`SELECT final_score, risk_level, summary, data_quality_note FROM reports WHERE task_id = ?`)
    .get(taskId) as ReportRow | undefined;

  if (!project || !report) {
    return null;
  }

  const dimensions = db
    .prepare(
      `SELECT dimension_key, dimension_name, final_score, summary
       FROM dimensions
       WHERE task_id = ?
       ORDER BY final_score ASC, dimension_name ASC`
    )
    .all(taskId) as DimensionRow[];

  const factors = db
    .prepare(
      `SELECT id, factor_key, factor_name, dimension_key, dimension_name, status, final_score, score_reason,
              risk_points_json, opportunity_points_json, evidence_refs_json
       FROM factors
       WHERE task_id = ?
       ORDER BY final_score ASC, factor_name ASC`
    )
    .all(taskId) as FactorRow[];

  const evidenceIds = Array.from(new Set(factors.flatMap((factor) => parseJsonArray(factor.evidence_refs_json))));

  const evidences =
    evidenceIds.length > 0
      ? (db
          .prepare(
            `SELECT id, source_id, evidence_type, title, summary, credibility_level, captured_at
             FROM evidences
             WHERE task_id = ? AND id IN (${evidenceIds.map(() => "?").join(",")})`
          )
          .all(taskId, ...evidenceIds) as EvidenceRow[])
      : [];

  const reviews = db
    .prepare(`SELECT COUNT(*) as count FROM review_records WHERE task_id = ?`)
    .get(taskId) as { count: number };

  const versions = db
    .prepare(`SELECT id, version_type, created_at FROM report_versions WHERE task_id = ? ORDER BY created_at DESC`)
    .all(taskId) as VersionMeta[];

  const latestVersion = pickLatestVersion(versions);
  const weakestDimensions = dimensions.slice(0, 3);
  const strongestDimensions = [...dimensions].sort((a, b) => b.final_score - a.final_score).slice(0, 2);
  const keyProblemFactors = factors.filter((factor) => (factor.final_score ?? 0) < 5).slice(0, 5);

  const topProblems = keyProblemFactors.slice(0, 3).map((factor) => ({
    factor_key: factor.factor_key,
    factor_name: FACTOR_LABELS[factor.factor_key] ?? factor.factor_name,
    statement: `${FACTOR_LABELS[factor.factor_key] ?? factor.factor_name}偏弱，${factorImpactText(factor)}`,
    supporting_reason: cleanReason(factor.score_reason)
  }));

  const positiveSignals = [...factors]
    .filter((factor) => (factor.final_score ?? 0) >= 7)
    .slice(0, 2)
    .map((factor) => ({
      factor_key: factor.factor_key,
      factor_name: FACTOR_LABELS[factor.factor_key] ?? factor.factor_name,
      statement: `${FACTOR_LABELS[factor.factor_key] ?? factor.factor_name}当前表现相对稳定。`
    }));

  const evidenceGroups = Object.entries(
    evidences.reduce<Record<string, EvidenceRow[]>>((acc, evidence) => {
      const group = SOURCE_GROUP_LABELS[evidence.evidence_type] ?? "其他";
      acc[group] ??= [];
      acc[group].push(evidence);
      return acc;
    }, {})
  ).map(([sourceGroup, items]) => ({
    source_group: sourceGroup,
    items: items.slice(0, 3).map((item) => ({
      evidence_type: item.evidence_type,
      title: item.title ?? "未命名证据",
      summary: item.summary ?? "暂无摘要。",
      credibility_level: item.credibility_level,
      captured_at: item.captured_at
    }))
  }));

  return {
    meta: {
      task_id: taskId,
      project_name: project.name,
      report_version_type: latestVersion?.version_type ?? "live_current",
      report_version_created_at: latestVersion?.created_at ?? null,
      review_count: reviews.count
    },
    execution_summary: {
      headline: overallJudgement(report.risk_level),
      final_score: report.final_score,
      risk_level: report.risk_level,
      risk_level_label: RISK_LEVEL_LABELS[report.risk_level] ?? report.risk_level,
      top_problems: topProblems,
      positive_signals: positiveSignals
    },
    overall_assessment: {
      conclusion: report.summary,
      data_quality_note: report.data_quality_note,
      recommended_decision: DECISION_LABELS[report.risk_level] ?? "建议继续复核"
    },
    dimension_overview: {
      items: dimensions.map((dimension) => ({
        dimension_key: dimension.dimension_key,
        dimension_name: DIMENSION_LABELS[dimension.dimension_key] ?? dimension.dimension_name,
        final_score: dimension.final_score,
        summary: dimension.summary,
        judgement: summarizeDimension(dimension.final_score)
      }))
    },
    key_issues: {
      items: keyProblemFactors.map((factor) => ({
        factor_key: factor.factor_key,
        factor_name: FACTOR_LABELS[factor.factor_key] ?? factor.factor_name,
        final_score: factor.final_score,
        issue_statement: cleanReason(factor.score_reason),
        business_impact: factorImpactText(factor),
        risk_points: parseJsonArray(factor.risk_points_json)
      }))
    },
    key_evidence: {
      groups: evidenceGroups
    },
    conclusion_and_next_step: {
      conclusion: conclusionText(report.risk_level),
      priority_review_areas: weakestDimensions.map(
        (dimension) => DIMENSION_LABELS[dimension.dimension_key] ?? dimension.dimension_name
      ),
      retained_strengths: strongestDimensions.map(
        (dimension) => DIMENSION_LABELS[dimension.dimension_key] ?? dimension.dimension_name
      ),
      strategy_entry_note: "本报告完成分析层收口，完整运营策略应在策略层单独生成。"
    }
  };
};
