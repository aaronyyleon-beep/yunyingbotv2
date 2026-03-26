import type { AppDbClient } from '../db/client.js';
export const deleteTask = async (db: AppDbClient, taskId: string) => {
  const task = await db.one<{ id: string; project_id: string }>(`SELECT id, project_id FROM analysis_tasks WHERE id = $1`, [taskId]);
  if (!task) return null;
  return db.transaction(async (tx) => {
    await tx.execute(`DELETE FROM analysis_tasks WHERE id = $1`, [taskId]);
    const remainingTaskCount = await tx.one<{ count: number }>(`SELECT COUNT(*)::int as count FROM analysis_tasks WHERE project_id = $1`, [task.project_id]);
    let deletedProjectId: string | null = null;
    if ((remainingTaskCount?.count ?? 0) === 0) {
      await tx.execute(`DELETE FROM projects WHERE id = $1`, [task.project_id]);
      deletedProjectId = task.project_id;
    }
    return { taskId, deleted: true, deletedProjectId };
  });
};
