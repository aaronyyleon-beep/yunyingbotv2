import type { PublicCollectionResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { insertEvidenceRecord, updateTaskStatuses } from "../repositories/core-task-chain-repository.js";
import { recordCollectionRunPg } from "./record-collection-run-pg.js";

const TWITTER_FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const stripTags = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeTwitterUrl = (value: string): string => value.replace(/^https:\/\/x\.com/i, "https://twitter.com");

const extractProfileHandle = (value: string): string | null => {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const extractTweetId = (value: string): string | null => value.match(/\/status\/(\d+)/i)?.[1] ?? null;

const collectTweetOEmbed = async (sourceUrl: string) => {
  const normalizedUrl = normalizeTwitterUrl(sourceUrl);
  const endpoint = new URL("https://publish.twitter.com/oembed");
  endpoint.searchParams.set("url", normalizedUrl);
  endpoint.searchParams.set("omit_script", "true");
  endpoint.searchParams.set("lang", "en");

  const response = await fetch(endpoint, {
    headers: { "User-Agent": TWITTER_FETCH_USER_AGENT }
  });
  if (!response.ok) {
    throw new Error(`tweet oEmbed fetch failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    author_name?: string;
    author_url?: string;
    html?: string;
    url?: string;
  };
  return {
    title: payload.author_name ? `Tweet by ${payload.author_name}` : "Public tweet",
    summary: stripTags(payload.html ?? "").slice(0, 500),
    rawContent: JSON.stringify(payload, null, 2)
  };
};

const collectProfilePage = async (sourceUrl: string) => {
  const normalizedUrl = normalizeTwitterUrl(sourceUrl);
  const response = await fetch(normalizedUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": TWITTER_FETCH_USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) {
    throw new Error(`profile fetch failed with status ${response.status}`);
  }
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : extractProfileHandle(sourceUrl);
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const summary = metaDescription ? metaDescription[1].trim().slice(0, 500) : stripTags(html).slice(0, 500);
  return {
    title: title ? `Profile ${title}` : "Twitter profile",
    summary,
    rawContent: html
  };
};

export const collectTwitterPublicPg = async (db: AppDbClient, taskId: string): Promise<PublicCollectionResult> => {
  const sources = await db.query<{ id: string; source_url: string }>(
    `SELECT id, source_url FROM sources WHERE task_id = $1 AND source_type = 'twitter'`,
    [taskId]
  );

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = new Date().toISOString();

  for (const source of sources) {
    const tweetId = extractTweetId(source.source_url);
    try {
      if (tweetId) {
        const tweet = await collectTweetOEmbed(source.source_url);
        await insertEvidenceRecord(db, {
          taskId,
          sourceId: source.id,
          evidenceType: "twitter_posts",
          title: tweet.title,
          summary: tweet.summary,
          rawContent: tweet.rawContent,
          credibilityLevel: "medium"
        });
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["completed", now, source.id]);
        collectedSources.push(source.source_url);
        evidenceCount += 1;
        continue;
      }

      const profile = await collectProfilePage(source.source_url);
      await insertEvidenceRecord(db, {
        taskId,
        sourceId: source.id,
        evidenceType: "twitter_profile",
        title: profile.title,
        summary: profile.summary,
        rawContent: profile.rawContent,
        credibilityLevel: "low"
      });
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["completed", now, source.id]);
      collectedSources.push(source.source_url);
      evidenceCount += 1;
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(`Twitter public fetch could not collect ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
    }
  }

  if (evidenceCount > 0) {
    await updateTaskStatuses(db, { taskId, collectionStatus: "evidence_ready" });
  }

  await recordCollectionRunPg(db, {
    taskId,
    collectorKey: "twitter_public_fetch",
    sourceType: "twitter",
    status: evidenceCount > 0 && skippedSources.length === 0 ? "completed" : evidenceCount > 0 ? "partial" : "failed",
    collectedCount: collectedSources.length,
    skippedCount: skippedSources.length,
    evidenceCount,
    warnings
  });

  return {
    taskId,
    collectedSources,
    skippedSources,
    warnings,
    evidenceCount
  };
};
