type CreateTaskButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  loading?: boolean;
  label?: string;
  loadingLabel?: string;
  className?: string;
};

export function CreateTaskButton(props: CreateTaskButtonProps) {
  const classes = ["task-create-btn"];
  if (props.active) classes.push("is-active");
  if (props.className) classes.push(props.className);

  return (
    <button type="button" className={classes.join(" ")} onClick={props.onClick} disabled={props.disabled}>
      {props.loading ? (props.loadingLabel ?? "创建中...") : (props.label ?? "+ 新建分析任务")}
    </button>
  );
}

