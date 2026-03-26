import type { AppDbClient } from '../db/client.js';
import { listTaskSourcesByTaskId } from '../repositories/core-task-chain-repository.js';
export const getTaskSources = async (db: AppDbClient, taskId: string) => {
  const items = await listTaskSourcesByTaskId(db, taskId);
  return items.map((item) => ({ ...item, is_official: item.is_official ? 1 : 0 }));
};
