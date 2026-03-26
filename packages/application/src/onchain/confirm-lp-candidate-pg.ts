import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

const nowIso = () => new Date().toISOString();

const toChainLabel = (chainKey: string) =>
  chainKey === "bsc"
    ? "BNB Chain"
    : chainKey === "ethereum"
      ? "Ethereum"
      : chainKey === "polygon"
        ? "Polygon"
        : chainKey === "avalanche"
          ? "Avalanche C-Chain"
          : chainKey;

export const confirmLpCandidatePg = async (
  db: AppDbClient,
  taskId: string,
  candidateId: string,
  action: "confirm" | "ignore"
) => {
  const candidate = await db.one<{
    id: string;
    task_id: string;
    source_id: string;
    chain_key: string;
    dex_label: string;
    quote_token_label: string;
    lp_address: string;
    status: string;
  }>(
    `SELECT id, task_id, source_id, chain_key, dex_label, quote_token_label, lp_address, status
     FROM onchain_lp_candidates
     WHERE task_id = $1 AND id = $2`,
    [taskId, candidateId]
  );

  if (!candidate) {
    throw new Error("lp_candidate_not_found");
  }

  const now = nowIso();
  if (action === "ignore") {
    await db.execute(`UPDATE onchain_lp_candidates SET status = $1, updated_at = $2 WHERE id = $3`, ["ignored", now, candidate.id]);
    return {
      candidateId,
      action: "ignored",
      createdSourceId: null
    };
  }

  const existingSource = await db.one<{ id: string }>(
    `SELECT id FROM sources WHERE task_id = $1 AND source_type = 'contract' AND source_url = $2`,
    [taskId, candidate.lp_address]
  );

  let createdSourceId = existingSource?.id ?? null;

  if (!existingSource) {
    const originSource = await db.one<{ project_id: string }>(
      `SELECT project_id FROM sources WHERE id = $1 AND task_id = $2`,
      [candidate.source_id, taskId]
    );
    if (!originSource) {
      throw new Error("origin_contract_source_not_found");
    }

    createdSourceId = randomUUID();
    await db.execute(
      `INSERT INTO sources (id, project_id, task_id, source_type, source_url, is_official, access_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [createdSourceId, originSource.project_id, taskId, "contract", candidate.lp_address, false, "pending", now, now]
    );

    await db.execute(
      `INSERT INTO onchain_source_contexts (id, task_id, source_id, chain_key, chain_label, contract_role_hint, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), taskId, createdSourceId, candidate.chain_key, toChainLabel(candidate.chain_key), "lp_pair", now, now]
    );
  }

  await db.execute(`UPDATE onchain_lp_candidates SET status = $1, updated_at = $2 WHERE id = $3`, ["confirmed", now, candidate.id]);

  return {
    candidateId,
    action: "confirmed",
    createdSourceId
  };
};
