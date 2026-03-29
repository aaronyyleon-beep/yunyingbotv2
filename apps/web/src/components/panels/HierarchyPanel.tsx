type HierarchyTask = {
  id: string;
  project_name: string;
  risk_level: string | null;
};

type HierarchyDimension = {
  name: string;
  factors: string[];
};

type HierarchyPanelProps = {
  allExpanded: boolean;
  level1Expanded: boolean;
  selectedTaskId: string | null;
  selectableTasks: HierarchyTask[];
  selectedTask: HierarchyTask | null;
  expandedDimensions: Set<string>;
  taskHierarchy: { level1: string; level2: HierarchyDimension[] };
  setSelectedTaskId: (id: string | null) => void;
  setLevel1Expanded: (updater: (current: boolean) => boolean) => void;
  handleToggleAllHierarchy: () => void;
  handleSelectDimension: (dimensionName: string) => void;
  handleToggleDimension: (dimensionName: string) => void;
  handleSelectFactor: (dimensionName: string, factorName: string) => void;
};

export function HierarchyPanel(props: HierarchyPanelProps) {
  return (
    <section className="hierarchy-card">
      <div className="hierarchy-toolbar">
        <p className="eyebrow">Task Hierarchy</p>
        <button type="button" className="submit-review secondary-action hierarchy-toggle-all" onClick={props.handleToggleAllHierarchy}>
          {props.allExpanded ? "一键收起" : "一键展开"}
        </button>
      </div>
      <label className="task-selector">
        <span>当前任务</span>
        <select
          value={props.selectedTaskId ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            props.setSelectedTaskId(value || null);
          }}
        >
          <option value="">未选择任务</option>
          {props.selectableTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.project_name} · {task.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <p className="muted">
          {props.selectedTask ? `当前聚焦：${props.selectedTask.project_name} · 风险等级 ${props.selectedTask.risk_level ?? "未知"}` : "先加载历史任务或创建新任务，再通过下拉切换。"}
        </p>
      </label>
      <div className="hierarchy-level1">
        <button type="button" className="hierarchy-button hierarchy-head hierarchy-collapsible" onClick={() => props.setLevel1Expanded((current) => !current)}>
          <span className="panel-tag">一级任务</span>
          <strong>{props.taskHierarchy.level1}</strong>
          <span className="hierarchy-toggle-mark">{props.level1Expanded ? "收起" : "展开"}</span>
        </button>
        {props.level1Expanded ? <p className="muted">该层用于定义产品基本面评估的总任务边界。</p> : null}
      </div>
      {props.level1Expanded ? (
        <div className="hierarchy-stack">
          {props.taskHierarchy.level2.map((dimension) => {
            const expanded = props.expandedDimensions.has(dimension.name);
            return (
              <article key={dimension.name} className="hierarchy-level2">
                <button
                  type="button"
                  className="hierarchy-button hierarchy-head hierarchy-collapsible"
                  onClick={() => {
                    props.handleSelectDimension(dimension.name);
                    props.handleToggleDimension(dimension.name);
                  }}
                >
                  <span className="panel-tag">二级任务</span>
                  <strong>{dimension.name}</strong>
                  <span className="hierarchy-toggle-mark">{expanded ? "收起" : "展开"}</span>
                </button>
                {expanded ? (
                  <div className="chip-row">
                    {dimension.factors.map((factor) => (
                      <button key={`${dimension.name}-${factor}`} type="button" className="chip hierarchy-chip hierarchy-button" onClick={() => props.handleSelectFactor(dimension.name, factor)}>
                        三级：{factor}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
