import type { AppDbClient } from '../db/client.js';
import { listCollectionRunsByTaskId } from '../repositories/core-task-chain-repository.js';
const parseWarnings = (value: unknown): string[] => {
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []; } catch { return []; }
};
export const getTaskCollectionRuns = async (db: AppDbClient, taskId: string) => {
  const items = await listCollectionRunsByTaskId(db, taskId);
  return items.map((item) => ({ ...item, warnings: parseWarnings(item.warnings_json) }));
};
