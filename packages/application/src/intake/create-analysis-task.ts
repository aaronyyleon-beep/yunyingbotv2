import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { TaskInputPayload } from "@yunyingbot/shared";

const nowIso = () => new Date().toISOString();

const normalizeValue = (value: string): string => value.trim();

export const createAnalysisTask = (
  db: DatabaseSync,
  projectId: string,
  inputs: TaskInputPayload[]
): { taskId: string } => {
  const taskId = randomUUID();
  const now = nowIso();

  db.prepare(
    `INSERT INTO analysis_tasks (
      id, project_id, task_status, collection_status, analysis_status, review_status, final_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(taskId, projectId, "created", "pending", "pending", "not_started", "draft", now, now);

  const insertInput = db.prepare(
    `INSERT INTO task_inputs (id, task_id, input_type, raw_value, normalized_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const input of inputs) {
    insertInput.run(randomUUID(), taskId, input.type, input.value, normalizeValue(input.value), now);
  }

  return { taskId };
};
