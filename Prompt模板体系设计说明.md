# Prompt 模板体系设计说明

## 1. 文档目标

本文档用于定义 MVP 第一阶段的 Prompt 模板体系，明确：

- 需要哪些 Prompt 类型
- 每类 Prompt 的职责
- 每类 Prompt 的输入结构
- 每类 Prompt 的输出结构
- Prompt 如何按层装载
- 哪些内容来自固定模板，哪些内容来自动态注入

本文档的目标不是直接产出最终文案，而是先把 Prompt 体系设计成一个稳定框架，方便后续落到代码与配置。

## 2. 设计原则

Prompt 体系必须满足以下原则：

- 一个 Prompt 只做一个阶段任务
- 一个 Prompt 只关注一个明确输出
- 模板固定，内容按需注入
- 尽量结构化输出
- 不把平台全部规则一次性塞进模型
- 稳定逻辑优先交给程序，而不是交给 Prompt

## 3. Prompt 体系总览

MVP 第一阶段建议至少准备以下 6 类 Prompt：

1. 项目主体识别 Prompt
2. 全局扫描 Prompt
3. 定向补抓 Prompt
4. 单因子分析 Prompt
5. 维度汇总 Prompt
6. 复核辅助 Prompt

后续可增加：

- 总报告生成 Prompt
- 策略草案 Prompt
- 对话追问 Prompt

## 4. Prompt 统一装载结构

所有 Prompt 建议统一采用四段结构：

### 4.1 基础系统段

作用：

- 放少量长期不变的平台原则

建议内容：

- 你是 Web3 项目运营分析平台的分析代理
- 必须坚持证据先于结论
- 必须对证据不足保持诚实
- 输出必须结构化、可解释

### 4.2 阶段任务段

作用：

- 说明当前正在执行什么阶段
- 当前目标是什么
- 当前不允许做什么

### 4.3 动态输入段

作用：

- 注入本次任务所需的对象

可能包括：

- 项目主体信息
- 来源清单
- 当前证据列表
- 当前因子定义
- 当前维度定义
- 人工补充事实

### 4.4 输出约束段

作用：

- 约束输出字段
- 约束输出格式
- 约束异常处理方式

## 5. Prompt 分类设计

### 5.1 项目主体识别 Prompt

#### 目标

从用户输入的链接、文本、文档线索中识别：

- 项目主体
- 官方来源
- 候选来源
- 主体识别置信度

#### 输入建议

- 原始输入列表
- 用户补充说明
- 已知来源类型规则

#### 输出建议

- `project_name`
- `project_aliases`
- `official_website`
- `official_twitter`
- `official_telegram`
- `official_discord`
- `docs_or_whitepaper`
- `contract_candidates`
- `confidence_level`
- `uncertainties`

#### 注意事项

- 不做因子分析
- 不生成总报告
- 主体不明确时必须明确指出

### 5.2 全局扫描 Prompt

#### 目标

在项目主体已确认的情况下，快速建立第一版项目全貌和来源地图。

#### 输入建议

- 已确认的项目主体
- 已识别来源清单
- 可访问的网页/文档摘要

#### 输出建议

- `project_snapshot`
- `source_map_summary`
- `key_entities`
- `initial_findings`
- `evidence_gaps`
- `next_collection_targets`

#### 注意事项

- 目标是建立全貌，不是深挖所有细节
- 要为后续定向补抓服务

### 5.3 定向补抓 Prompt

#### 目标

根据证据缺口，判断下一轮最值得补抓的来源和对象。

#### 输入建议

- 当前项目主体
- 当前来源清单
- 当前证据缺口
- 当前低置信度因子候选

#### 输出建议

- `targeted_collection_plan`
- `priority_targets`
- `expected_factor_coverage`
- `blocking_risks`

#### 注意事项

- 只输出补抓计划，不做最终评分
- 重点判断“抓什么最值”

### 5.4 单因子分析 Prompt

#### 目标

对某一个明确因子进行分析和打分。

#### 输入建议

- 当前 `factor_key`
- 当前因子定义
- 当前因子所属维度
- 当前证据集合
- 当前评分规则摘要

#### 输出建议

- `factor_key`
- `ai_score`
- `score_reason`
- `confidence_level`
- `risk_points`
- `opportunity_points`
- `evidence_refs`
- `evidence_sufficiency`

#### 注意事项

- 一次只分析一个因子
- 不扩展到其他因子
- 证据不足时要明确输出不足原因

### 5.5 维度汇总 Prompt

#### 目标

对某一个维度下的多个因子结果做业务层总结。

#### 输入建议

- 当前维度定义
- 当前维度下的因子结果

#### 输出建议

- `dimension_key`
- `dimension_score`
- `dimension_summary`
- `key_positive_factors`
- `key_negative_factors`
- `high_risk_points`
- `high_opportunity_points`

#### 注意事项

- 不重新发明因子分数
- 重点做归纳、提炼、解释

### 5.6 复核辅助 Prompt

#### 目标

在人工补充事实或改单因子时，解释这次修改可能带来的影响。

#### 输入建议

- 当前因子原始结果
- 当前因子证据
- 人工补充事实
- 人工拟修正分

#### 输出建议

- `updated_factor_reasoning`
- `impact_on_dimension`
- `impact_on_report`
- `remaining_uncertainties`

#### 注意事项

- 这是复核辅助，不是最终落库逻辑
- 最终数值更新仍由程序控制

## 6. 输出 Schema 设计建议

Prompt 的输出建议始终采用结构化 schema。

原因：

- 稳定
- 可校验
- 易入库
- 易调试

建议所有 Prompt 输出：

- 固定字段名
- 枚举字段受控
- 文本长度适中
- 缺失时允许返回 `null` 或空数组

不建议输出：

- 大段自由散文
- 无法解析的混合文本
- 不受控字段名

## 7. 模板与动态注入边界

### 7.1 固定模板中应包含

- 平台原则
- 当前阶段任务说明
- 输出字段说明
- 失败时的处理原则

### 7.2 动态注入中应包含

- 当前项目上下文
- 当前来源或证据
- 当前因子定义
- 当前维度定义
- 当前人工补充内容

### 7.3 不应重复注入的内容

- 全因子列表
- 全平台长文档
- 全部工作流规则
- 全部评分表

## 8. Prompt 文件组织建议

建议目录如下：

```text
prompts/
  identify-project/
    system.md
    task.md
    schema.json
  collect-global/
    system.md
    task.md
    schema.json
  collect-targeted/
    system.md
    task.md
    schema.json
  analyze-factor/
    system.md
    task.md
    schema.json
  summarize-dimension/
    system.md
    task.md
    schema.json
  review-assistant/
    system.md
    task.md
    schema.json
```

说明：

- `system.md`：放该类 Prompt 的基础行为说明
- `task.md`：放阶段说明与模板
- `schema.json`：放结构化输出定义

## 9. 与配置系统的关系

Prompt 不应独立存在，而应与配置系统联动。

建议：

- 因子定义来自 `configs/factors`
- 维度定义来自 `configs/dimensions`
- 工作流阶段定义来自 `configs/workflows`
- 评分阈值来自 `configs/scoring`

Prompt 只引用这些配置，而不是复制一遍。

## 10. MVP 第一阶段实现建议

建议先落以下最小 Prompt 集：

1. `identify-project`
2. `collect-global`
3. `collect-targeted`
4. `analyze-factor`
5. `summarize-dimension`
6. `review-assistant`

可以暂缓：

- `generate-report`
- `strategy-draft`
- `conversation-followup`

原因：

- 第一阶段先跑通分析主链路更重要
- 总报告可以先由程序拼装结构 + 简短 LLM 总结

## 11. 当前结论

Prompt 体系的正确方向不是“写几段很长的万能 Prompt”，而是：

- 分阶段
- 分对象
- 分职责
- 强 schema
- 强配置驱动

一句话总结：

**让 Prompt 成为工作流里的小工具，而不是让单个 Prompt 承担整个平台的大脑。**
