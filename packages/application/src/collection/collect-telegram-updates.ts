import type { PublicCollectionResult } from '@yunyingbot/shared';
import type { AppDbClient } from '../db/client.js';
export const collectTelegramUpdates = async (_db: AppDbClient, _repoRoot: string, taskId: string): Promise<PublicCollectionResult> => ({ taskId, collectedSources: [], skippedSources: [], warnings: ['Telegram PostgreSQL collector pending migration.'], evidenceCount: 0 });
