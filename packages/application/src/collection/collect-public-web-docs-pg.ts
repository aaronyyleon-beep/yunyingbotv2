import type { PublicCollectionResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { insertEvidenceRecord, updateTaskStatuses } from "../repositories/core-task-chain-repository.js";
import { recordCollectionRunPg } from "./record-collection-run-pg.js";

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

export const collectPublicWebDocsPg = async (db: AppDbClient, taskId: string): Promise<PublicCollectionResult> => {
  const sources = await db.query<{ id: string; source_url: string; source_type: string }>(
    `SELECT id, source_url, source_type
     FROM sources
     WHERE task_id = $1
       AND source_type IN ('website', 'docs', 'whitepaper')`,
    [taskId]
  );

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = new Date().toISOString();

  for (const source of sources) {
    if (source.source_type === "whitepaper" && source.source_url.endsWith(".pdf")) {
      skippedSources.push(source.source_url);
      warnings.push(`PDF whitepaper fetch metadata recorded but PDF parsing is not implemented yet: ${source.source_url}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
      continue;
    }

    try {
      const response = await fetch(source.source_url, {
        headers: { "User-Agent": "yunyingbotv2/0.1 public-docs-collector" }
      });

      if (!response.ok) {
        skippedSources.push(source.source_url);
        warnings.push(`Fetch failed for ${source.source_url} with status ${response.status}`);
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
        continue;
      }

      const html = await response.text();
      const title = extractTitle(html);
      const summary = extractSummary(html);
      const evidenceType = source.source_type === "website" ? "website_page" : "docs_page";

      await insertEvidenceRecord(db, {
        taskId,
        sourceId: source.id,
        evidenceType,
        title,
        summary,
        rawContent: html.slice(0, 50000),
        credibilityLevel: "medium"
      });

      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["completed", now, source.id]);
      collectedSources.push(source.source_url);
      evidenceCount += 1;
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(`Fetch error for ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
    }
  }

  await updateTaskStatuses(db, {
    taskId,
    collectionStatus: "evidence_ready"
  });

  await recordCollectionRunPg(db, {
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
