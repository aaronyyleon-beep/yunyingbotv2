import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AppDbClient } from "../db/client.js";
import { getTaskSnapshotCore, insertSourceRecord, insertTaskInputRecord } from "../repositories/core-task-chain-repository.js";

const sanitizeFileName = (value: string) => {
  const trimmed = value.trim() || "whitepaper.pdf";
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
};

export interface UploadWhitepaperDocumentInput {
  fileName: string;
  mimeType?: string | null;
  contentBase64: string;
}

export const uploadWhitepaperDocumentPg = async (
  db: AppDbClient,
  repoRoot: string,
  taskId: string,
  input: UploadWhitepaperDocumentInput
) => {
  const task = await getTaskSnapshotCore(db, taskId);
  if (!task) {
    throw new Error("task_not_found");
  }

  const fileName = sanitizeFileName(input.fileName);
  const pdfBuffer = Buffer.from(input.contentBase64, "base64");
  if (pdfBuffer.length === 0) {
    throw new Error("empty_document");
  }

  const looksLikePdf = pdfBuffer.subarray(0, 4).toString("utf8") === "%PDF";
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  if (!looksLikePdf && mimeType !== "application/pdf") {
    throw new Error("unsupported_document_type");
  }

  const storageDir = path.join(repoRoot, "data", "local", "uploads", "whitepapers");
  await mkdir(storageDir, { recursive: true });
  const storedFileName = `${taskId}-${Date.now()}-${fileName}`;
  const absolutePath = path.join(storageDir, storedFileName);
  await writeFile(absolutePath, pdfBuffer);

  const sourceUrl = pathToFileURL(absolutePath).toString();
  const source = await insertSourceRecord(db, {
    projectId: task.project.id,
    taskId,
    sourceType: "whitepaper",
    sourceUrl,
    isOfficial: true,
    accessStatus: "pending"
  });

  await insertTaskInputRecord(db, {
    taskId,
    inputType: "document",
    rawValue: fileName,
    normalizedValue: sourceUrl
  });

  return {
    taskId,
    sourceId: source.id,
    fileName,
    mimeType: mimeType || "application/pdf",
    sourceUrl
  };
};
