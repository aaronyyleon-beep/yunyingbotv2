import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import { recordCollectionRun } from "./record-collection-run.js";

const nowIso = () => new Date().toISOString();

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
    if (parts[1] === "status") return parts[0] ?? null;
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const extractTweetId = (value: string): string | null => {
  const match = value.match(/\/status\/(\d+)/i);
  return match?.[1] ?? null;
};

const insertEvidence = (
  db: DatabaseSync,
  taskId: string,
  sourceId: string,
  evidenceType: string,
  title: string | null,
  summary: string,
  rawContent: string,
  credibilityLevel: "low" | "medium" | "high"
) => {
  const now = nowIso();
  db.prepare(
    `INSERT INTO evidences (
      id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), taskId, sourceId, evidenceType, title, summary, rawContent.slice(0, 50000), credibilityLevel, now, now);
};

const collectTweetOEmbed = async (sourceUrl: string) => {
  const normalizedUrl = normalizeTwitterUrl(sourceUrl);
  const endpoint = new URL("https://publish.twitter.com/oembed");
  endpoint.searchParams.set("url", normalizedUrl);
  endpoint.searchParams.set("omit_script", "true");
  endpoint.searchParams.set("lang", "en");

  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": TWITTER_FETCH_USER_AGENT
    }
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

  const embedText = stripTags(payload.html ?? "");
  return {
    title: payload.author_name ? `Tweet by ${payload.author_name}` : "Public tweet",
    summary: embedText.slice(0, 500),
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

export const collectTwitterPublic = async (db: DatabaseSync, taskId: string): Promise<PublicCollectionResult> => {
  const sources = db
    .prepare(
      `SELECT id, source_url
       FROM sources
       WHERE task_id = ?
         AND source_type = 'twitter'`
    )
    .all(taskId) as Array<{ id: string; source_url: string }>;

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = nowIso();

  for (const source of sources) {
    const tweetId = extractTweetId(source.source_url);

    try {
      if (tweetId) {
        const tweet = await collectTweetOEmbed(source.source_url);
        insertEvidence(db, taskId, source.id, "twitter_posts", tweet.title, tweet.summary, tweet.rawContent, "medium");
        db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("completed", now, source.id);
        collectedSources.push(source.source_url);
        evidenceCount += 1;
        continue;
      }

      const profile = await collectProfilePage(source.source_url);
      insertEvidence(
        db,
        taskId,
        source.id,
        "twitter_profile",
        profile.title,
        profile.summary,
        profile.rawContent,
        "low"
      );
      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("completed", now, source.id);
      collectedSources.push(source.source_url);
      evidenceCount += 1;
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(
        `Twitter public fetch could not collect ${source.source_url}: ${
          error instanceof Error ? error.message : "unknown_error"
        }`
      );
      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("failed", now, source.id);
    }
  }

  if (evidenceCount > 0) {
    db.prepare(`UPDATE analysis_tasks SET collection_status = ?, updated_at = ? WHERE id = ?`).run(
      "evidence_ready",
      now,
      taskId
    );
  }

  recordCollectionRun(db, {
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
