import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import type { PublicCollectionResult } from "@yunyingbot/shared";
import type { AppDbClient } from "../db/client.js";
import { insertEvidenceRecord, updateTaskStatuses } from "../repositories/core-task-chain-repository.js";
import { recordCollectionRunPg } from "./record-collection-run-pg.js";

const normalizeText = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, " ")
    .trim();

export const collectWhitepaperPdfPg = async (db: AppDbClient, taskId: string): Promise<PublicCollectionResult> => {
  const sources = await db.query<{ id: string; source_url: string }>(
    `SELECT id, source_url
     FROM sources
     WHERE task_id = $1
       AND source_type = 'whitepaper'`,
    [taskId]
  );

  const collectedSources: string[] = [];
  const skippedSources: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = new Date().toISOString();

  for (const source of sources) {
    const isLocalFile = source.source_url.startsWith("file://");
    if (!isLocalFile && !source.source_url.toLowerCase().endsWith(".pdf")) {
      skippedSources.push(source.source_url);
      warnings.push(`Whitepaper source is not a direct PDF URL and was skipped: ${source.source_url}`);
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
      continue;
    }

    try {
      const pdfBuffer = isLocalFile
        ? await readFile(fileURLToPath(source.source_url))
        : await (async () => {
            const response = await fetch(source.source_url, {
              headers: { "User-Agent": "yunyingbotv2/0.1 whitepaper-pdf-collector" }
            });

            if (!response.ok) {
              skippedSources.push(source.source_url);
              warnings.push(`Whitepaper PDF fetch failed for ${source.source_url} with status ${response.status}`);
              await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
              return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
          })();

      if (!pdfBuffer) {
        continue;
      }

      const parser = new PDFParse({ data: pdfBuffer });
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo();
      await parser.destroy();
      const text = normalizeText(textResult.text ?? "");

      if (!text) {
        skippedSources.push(source.source_url);
        warnings.push(`Whitepaper PDF parsed but returned empty text: ${source.source_url}`);
        await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["partial", now, source.id]);
        continue;
      }

      const titleFromMeta = normalizeText(infoResult.info?.Title ?? "");
      const title = titleFromMeta || "Whitepaper PDF";
      const summary = text.slice(0, 500);
      const rawContent = JSON.stringify(
        {
          sourceUrl: source.source_url,
          pageCount: infoResult.total ?? null,
          info: infoResult.info ?? null,
          text: text.slice(0, 50000)
        },
        null,
        2
      );

      await insertEvidenceRecord(db, {
        taskId,
        sourceId: source.id,
        evidenceType: "whitepaper_page",
        title,
        summary,
        rawContent,
        credibilityLevel: "medium"
      });

      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["completed", now, source.id]);
      collectedSources.push(source.source_url);
      evidenceCount += 1;
    } catch (error) {
      skippedSources.push(source.source_url);
      warnings.push(
        `Whitepaper PDF parse failed for ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`
      );
      await db.execute(`UPDATE sources SET access_status = $1, updated_at = $2 WHERE id = $3`, ["failed", now, source.id]);
    }
  }

  if (evidenceCount > 0) {
    await updateTaskStatuses(db, {
      taskId,
      collectionStatus: "evidence_ready"
    });
  }

  await recordCollectionRunPg(db, {
    taskId,
    collectorKey: "whitepaper_pdf_parse",
    sourceType: "whitepaper",
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
