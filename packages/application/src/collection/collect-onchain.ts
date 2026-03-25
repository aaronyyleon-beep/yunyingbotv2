import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { loadRepoEnv } from "../config/load-env.js";
import { recordCollectionRun } from "./record-collection-run.js";

const nowIso = () => new Date().toISOString();

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

const callRpc = async <T>(rpcUrl: string, method: string, params: unknown[]): Promise<JsonRpcResponse<T>> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`rpc_http_${response.status}`);
  }

  return (await response.json()) as JsonRpcResponse<T>;
};

const hexToDecimalString = (value: string): string => {
  try {
    return BigInt(value).toString(10);
  } catch {
    return value;
  }
};

const CHAIN_RPC_ENV_KEYS: Record<string, string> = {
  ethereum: "ONCHAIN_RPC_ETHEREUM",
  bsc: "ONCHAIN_RPC_BSC",
  base: "ONCHAIN_RPC_BASE",
  arbitrum: "ONCHAIN_RPC_ARBITRUM",
  polygon: "ONCHAIN_RPC_POLYGON",
  optimism: "ONCHAIN_RPC_OPTIMISM",
  avalanche: "ONCHAIN_RPC_AVALANCHE"
};

export const collectOnchain = async (db: DatabaseSync, repoRoot: string, taskId: string) => {
  const env = loadRepoEnv(repoRoot);
  const contractSources = db
    .prepare(`SELECT id, source_url FROM sources WHERE task_id = ? AND source_type = 'contract'`)
    .all(taskId) as Array<{ id: string; source_url: string }>;
  const onchainContexts = db
    .prepare(`SELECT source_id, chain_key, chain_label FROM onchain_source_contexts WHERE task_id = ?`)
    .all(taskId) as Array<{ source_id: string; chain_key: string; chain_label: string }>;

  const collectedContracts: string[] = [];
  const skippedContracts: string[] = [];
  const warnings: string[] = [];
  let evidenceCount = 0;
  const now = nowIso();

  if (contractSources.length === 0) {
    warnings.push("当前任务没有合约来源，无法执行链上基础识别。");
    return {
      taskId,
      collectedContracts,
      skippedContracts,
      warnings,
      evidenceCount
    };
  }

  for (const source of contractSources) {
    const context = onchainContexts.find((item) => item.source_id === source.id);
    const chainKey = context?.chain_key ?? env.ONCHAIN_CHAIN_LABEL?.trim() ?? "ethereum";
    const chainLabel = context?.chain_label ?? chainKey;
    const rpcEnvKey = CHAIN_RPC_ENV_KEYS[chainKey];
    const rpcUrl = (rpcEnvKey ? env[rpcEnvKey] : undefined)?.trim() ?? env.ONCHAIN_RPC_URL?.trim();

    if (!rpcUrl) {
      skippedContracts.push(source.source_url);
      warnings.push(`${chainLabel} 还没有配置可用 RPC，当前无法采集合约 ${source.source_url}。`);
      continue;
    }

    let latestBlockSummary = "unknown";
    try {
      const latestBlock = await callRpc<string>(rpcUrl, "eth_blockNumber", []);
      if (latestBlock.error) {
        warnings.push(`${chainLabel} 最新区块读取失败：${latestBlock.error.message}`);
      } else if (latestBlock.result) {
        latestBlockSummary = hexToDecimalString(latestBlock.result);
      }
    } catch (error) {
      warnings.push(`${chainLabel} 最新区块探测失败：${error instanceof Error ? error.message : "unknown_error"}`);
    }

    try {
      const payload = await callRpc<string>(rpcUrl, "eth_getCode", [source.source_url, "latest"]);
      if (payload.error) {
        skippedContracts.push(source.source_url);
        warnings.push(`${chainLabel} 合约代码读取失败 ${source.source_url}: ${payload.error.message}`);
        continue;
      }

      const bytecode = payload.result ?? "0x";
      const hasCode = bytecode !== "0x";
      let balanceSummary = "unknown";

      try {
        const balancePayload = await callRpc<string>(rpcUrl, "eth_getBalance", [source.source_url, "latest"]);
        if (balancePayload.error) {
          warnings.push(`${chainLabel} 原生币余额读取失败 ${source.source_url}: ${balancePayload.error.message}`);
        } else if (balancePayload.result) {
          balanceSummary = hexToDecimalString(balancePayload.result);
        }
      } catch (error) {
        warnings.push(`${chainLabel} 原生币余额探测失败 ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
      }

      db.prepare(
        `INSERT INTO evidences (
          id, task_id, source_id, evidence_type, title, summary, raw_content, credibility_level, captured_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        taskId,
        source.id,
        "onchain_metric",
        `链上基础识别：${source.source_url}`,
        hasCode
          ? `已在 ${chainLabel} 上识别到合约代码；最新区块 ${latestBlockSummary}；原生币余额 ${balanceSummary}。`
          : `在 ${chainLabel} 上未识别到合约代码；最新区块 ${latestBlockSummary}；原生币余额 ${balanceSummary}。`,
        JSON.stringify({
          bytecodePreview: bytecode.slice(0, 120),
          latestBlock: latestBlockSummary,
          balance: balanceSummary,
          hasCode
        }),
        "high",
        now,
        now
      );

      db.prepare(`UPDATE sources SET access_status = ?, updated_at = ? WHERE id = ?`).run("completed", now, source.id);
      collectedContracts.push(source.source_url);
      evidenceCount += 1;
    } catch (error) {
      skippedContracts.push(source.source_url);
      warnings.push(`${chainLabel} RPC 读取失败 ${source.source_url}: ${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }

  recordCollectionRun(db, {
    taskId,
    collectorKey: "onchain_rpc_provider",
    sourceType: "onchain",
    status: evidenceCount > 0 && skippedContracts.length === 0 ? "completed" : evidenceCount > 0 ? "partial" : "failed",
    collectedCount: collectedContracts.length,
    skippedCount: skippedContracts.length,
    evidenceCount,
    warnings
  });

  return {
    taskId,
    collectedContracts,
    skippedContracts,
    warnings,
    evidenceCount
  };
};
