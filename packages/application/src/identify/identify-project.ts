import type { AppDbClient } from '../db/client.js';
import type { TaskInputPayload } from '@yunyingbot/shared';
import { createAnalysisTaskPg } from '../intake/create-analysis-task-pg.js';

const extractHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const inferSource = (value: string) => {
  const trimmed = value.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { sourceType: 'contract', sourceUrl: trimmed, isOfficial: false };
  const hostname = extractHostname(trimmed);
  if (!hostname) return { sourceType: 'unknown', sourceUrl: trimmed, isOfficial: false };
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return { sourceType: 'twitter', sourceUrl: trimmed, isOfficial: true };
  if (hostname.includes('t.me') || hostname.includes('telegram.me')) return { sourceType: 'telegram', sourceUrl: trimmed, isOfficial: true };
  if (hostname.includes('discord.gg') || hostname.includes('discord.com')) return { sourceType: 'discord', sourceUrl: trimmed, isOfficial: true };
  if (trimmed.endsWith('.pdf')) return { sourceType: 'whitepaper', sourceUrl: trimmed, isOfficial: true };
  if (hostname.startsWith('docs.') || trimmed.includes('/docs') || trimmed.includes('gitbook')) return { sourceType: 'docs', sourceUrl: trimmed, isOfficial: true };
  return { sourceType: 'website', sourceUrl: trimmed, isOfficial: true };
};

const extractTwitterHandle = (value: string): string | null => {
  const hostname = extractHostname(value);
  if (!hostname || (!hostname.includes('twitter.com') && !hostname.includes('x.com'))) return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const inferProjectName = (inputs: TaskInputPayload[]): string => {
  const sourceCandidates = inputs.filter((input) => input.type === 'url').map((input) => inferSource(input.value));
  const websiteCandidate = sourceCandidates.find((candidate) => candidate.sourceType === 'website');
  if (websiteCandidate) {
    const hostname = extractHostname(websiteCandidate.sourceUrl);
    if (hostname) return hostname.replace(/^www\./, '').split('.')[0];
  }
  const twitterCandidate = sourceCandidates.find((candidate) => candidate.sourceType === 'twitter');
  if (twitterCandidate) return extractTwitterHandle(twitterCandidate.sourceUrl) ?? 'unknown-project';
  const meaningfulText = inputs.filter((input) => input.type === 'text').map((input) => input.value.trim()).find((value) => value.length > 0 && !/^chain:/i.test(value));
  if (meaningfulText) return meaningfulText.slice(0, 32).trim() || 'unknown-project';
  const contractCandidate = sourceCandidates.find((candidate) => candidate.sourceType === 'contract');
  if (contractCandidate) return `${contractCandidate.sourceUrl.slice(0, 8)}...`;
  return 'unknown-project';
};

export const inferProjectNameFromInputs = (inputs: TaskInputPayload[]): string => inferProjectName(inputs);

export const identifyProject = async (
  db: AppDbClient,
  taskId: string,
  inputs: TaskInputPayload[],
  _preferredProjectId?: string
): Promise<Record<string, unknown>> => {
  const result = await createAnalysisTaskPg(db, inputs, 0);
  return 'deduped' in result ? { taskId, projectId: null, projectName: inferProjectName(inputs), identifiedSources: [], uncertainties: ['deduped_task_reused'] } : result;
};
