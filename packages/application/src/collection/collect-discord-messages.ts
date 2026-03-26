import type { PublicCollectionResult } from '@yunyingbot/shared';
import type { AppDbClient } from '../db/client.js';
export const collectDiscordMessages = async (_db: AppDbClient, _repoRoot: string, taskId: string): Promise<PublicCollectionResult> => ({ taskId, collectedSources: [], skippedSources: [], warnings: ['Discord PostgreSQL collector pending migration.'], evidenceCount: 0 });
