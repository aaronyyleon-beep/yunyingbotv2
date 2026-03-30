import path from 'node:path';
import {
  claimNextTwitterBrowserJob,
  collectTwitterBrowser,
  completeTwitterBrowserJob,
  failTwitterBrowserJob,
  getPostgresDatabase,
  ingestTelegramBuffer,
  loadRuntimeSnapshot
} from '@yunyingbot/application';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const workerId = `${process.pid}`;
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
const idleLogEvery = Number(process.env.WORKER_IDLE_LOG_EVERY ?? 20);
const telegramIngestEnabled = (process.env.TELEGRAM_INGEST_ENABLED ?? 'true').toLowerCase() !== 'false';
const telegramIngestIntervalMs = Number(process.env.TELEGRAM_INGEST_INTERVAL_MS ?? 5000);
const db = getPostgresDatabase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let running = true;
let idleTicks = 0;
let telegramDisabledLogged = false;

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

const runTelegramIngestionLoop = async () => {
  if (!telegramIngestEnabled) {
    console.log('[worker] telegram ingestion loop disabled (TELEGRAM_INGEST_ENABLED=false)');
    return;
  }
  console.log(`[worker] telegram ingestion loop started interval=${telegramIngestIntervalMs}ms`);
  while (running) {
    try {
      const result = await ingestTelegramBuffer(db, repoRoot);
      if (!result.enabled) {
        if (!telegramDisabledLogged && result.warnings.length > 0) {
          console.warn('[worker] telegram ingestion disabled:', result.warnings.join(' | '));
          telegramDisabledLogged = true;
        }
      } else if (result.updatesFetched > 0 || result.messagesBuffered > 0 || result.warnings.length > 0) {
        telegramDisabledLogged = false;
        console.log(
          `[worker] telegram ingestion updates=${result.updatesFetched} seen=${result.messagesSeen} buffered=${result.messagesBuffered}` +
            (result.warnings.length > 0 ? ` warnings=${result.warnings.join(' | ')}` : '')
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      console.error(`[worker] telegram ingestion failed: ${message}`);
    }
    await sleep(telegramIngestIntervalMs);
  }
  console.log('[worker] telegram ingestion loop stopped');
};

const main = async () => {
  const snapshot = loadRuntimeSnapshot(repoRoot);
  console.log('[worker] runtime snapshot loaded');
  console.log(
    JSON.stringify(
      { generatedAt: snapshot.generatedAt, workerId, pollIntervalMs, telegramIngestEnabled, telegramIngestIntervalMs },
      null,
      2
    )
  );
  const telegramIngestionLoop = runTelegramIngestionLoop();
  while (running) {
    let job;
    try {
      job = await claimNextTwitterBrowserJob(db, workerId);
    } catch (error) {
      console.error('[worker] failed to claim job:', error);
      await sleep(pollIntervalMs);
      continue;
    }
    if (!job) {
      idleTicks += 1;
      if (idleTicks % Math.max(1, idleLogEvery) === 0) console.log('[worker] idle, waiting for twitter browser jobs...');
      await sleep(pollIntervalMs);
      continue;
    }
    idleTicks = 0;
    console.log(`[worker] job claimed ${job.jobId} task=${job.taskId} attempt=${job.attempts}/${job.maxAttempts}`);
    try {
      const result = await collectTwitterBrowser(db, repoRoot, job.taskId);
      await completeTwitterBrowserJob(db, job.jobId, result);
      console.log(`[worker] job completed ${job.jobId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      await failTwitterBrowserJob(db, job.jobId, message, job.attempts, job.maxAttempts);
      console.error(`[worker] job failed ${job.jobId}: ${message}`);
    }
  }
  await telegramIngestionLoop;
  console.log('[worker] stopping gracefully');
};
void main();
