import path from 'node:path';
import {
  claimNextTwitterBrowserJob,
  collectTwitterBrowser,
  completeTwitterBrowserJob,
  failTwitterBrowserJob,
  getPostgresDatabase,
  loadRuntimeSnapshot
} from '@yunyingbot/application';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const workerId = `${process.pid}`;
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
const idleLogEvery = Number(process.env.WORKER_IDLE_LOG_EVERY ?? 20);
const db = getPostgresDatabase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let running = true;
let idleTicks = 0;

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

const main = async () => {
  const snapshot = loadRuntimeSnapshot(repoRoot);
  console.log('[worker] runtime snapshot loaded');
  console.log(JSON.stringify({ generatedAt: snapshot.generatedAt, workerId, pollIntervalMs }, null, 2));
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
  console.log('[worker] stopping gracefully');
};
void main();
