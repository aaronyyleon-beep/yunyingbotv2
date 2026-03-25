import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import { recordCollectionRun } from "./record-collection-run.js";

const nowIso = () => new Date().toISOString();

const stripTags = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).slice(0, 200) : null;
};

const extractSummary = (html: string): string => {
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (metaDescription) {
    return metaDescription[1].trim().slice(0, 500);
  }
  return stripTags(html).slice(0, 500);
};

export const collectPublicWebDocs = async (db: DatabaseSync, taskId: string): Promise<PublicCollectionResult> => {
  const sources = db
    .prepare(
      `SELECT id, source_url, source_type
       FROM sources
       WHERE task_id = ?
         AND source_type IN ('website', 'docs', 'whitepaper')`
    )
    .all(taskId) as Array<{ id: string; source_url: string; source_type: string }>;

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = nowIso();

  for (const source of sources) {
    if (source.source_type === "whitepaper" && source.source_url.endsWith(".pdf")) {
      skippedSources.push(source.source_url);
      warnings.push(`PDF whitepaper fetch metadata recorded but PDF parsing is not implemented yet: ${source.source_url}`);
      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("partial", now, source.id);
      continue;
    }

    try {
      const response = await fetch(source.source_url, {
        headers: {
          "User-Agent": "yunyingbotv2/0.1 public-docs-collector"
        }
      });

      if (!response.ok) {
        skippedSources.push(source.source_url);
        warnings.push(`Fetch failed for ${source.source_url} with status ${response.status}`);
        db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("failed", now, source.id);
        continue;
      }

      const html = await response.text();
      const title = extractTitle(html);
      const summary = extractSummary(html);
      const evidenceType = source.source_type === "website" ? "website_page" : "docs_page";

      db.prepare(
        `INSERT INTO evidences (
          id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), taskId, source.id, evidenceType, title, summary, html.slice(0, 50000), "medium", now, now);

      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("completed", now, source.id);
      collectedSources.push(source.source_url);
      evidenceCount += 1;
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(`Fetch error for ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("failed", now, source.id);
    }
  }

  db.prepare(`UPDATE analysis_tasks SET collection_status = ?, updated_at = ? WHERE id = ?`).run("evidence_ready", now, taskId);

  recordCollectionRun(db, {
    taskId,
    collectorKey: "public_web_fetch",
    sourceType: "website_docs",
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
