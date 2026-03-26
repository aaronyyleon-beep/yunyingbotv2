import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required for pnpm test");
  process.exit(1);
}

const fixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fixture Docs</title>
    <meta name="description" content="Fixture documentation page for PostgreSQL smoke e2e." />
  </head>
  <body>
    <main>
      <h1>Fixture Docs</h1>
      <p>Documentation overview for a testable product surface.</p>
      <section>
        <h2>Getting started</h2>
        <p>This fixture simulates website evidence for product maturity analysis.</p>
      </section>
    </main>
  </body>
</html>`;

const fixtureContractAddress = "0x1111111111111111111111111111111111111111";

const encodeStringResult = (value: string) => {
  const hex = Buffer.from(value, "utf8").toString("hex");
  const length = (hex.length / 2).toString(16).padStart(64, "0");
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  return `0x${"20".padStart(64, "0")}${length}${padded}`;
};

const encodeUintResult = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;

const encodeAddressResult = (value: string) => `0x${value.replace(/^0x/, "").padStart(64, "0")}`;

const startRpcFixtureServer = async () => {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      id: number;
      method: string;
      params: unknown[];
    };

    const respond = (result: string) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
    };

    switch (payload.method) {
      case "eth_blockNumber":
        respond("0x123456");
        return;
      case "eth_getCode":
        respond("0x600060005560206000f3");
        return;
      case "eth_getBalance":
        respond("0xde0b6b3a7640000");
        return;
      case "eth_getStorageAt":
        respond("0x" + "0".repeat(64));
        return;
      case "eth_call": {
        const call = payload.params[0] as { to: string; data: string };
        const selector = call.data.slice(2, 10).toLowerCase();
        if (selector === "06fdde03") return respond(encodeStringResult("Fixture Token"));
        if (selector === "95d89b41") return respond(encodeStringResult("FIX"));
        if (selector === "313ce567") return respond(encodeUintResult(18n));
        if (selector === "18160ddd") return respond(encodeUintResult(1_000_000n * 10n ** 18n));
        if (selector === "8da5cb5b") return respond(encodeAddressResult("0x000000000000000000000000000000000000dEaD"));
        respond("0x");
        return;
      }
      default:
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32601, message: "method not found" } }));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("rpc_fixture_server_failed");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`
  };
};

const startFixtureServer = async () => {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fixtureHtml);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("fixture_server_failed");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`
  };
};

const waitForHealth = async (baseUrl: string, timeoutMs = 30_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`api_health_timeout:${baseUrl}`);
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`http_${response.status}:${text}`);
  }
  return JSON.parse(text) as T;
};

const run = async () => {
  const fixture = await startFixtureServer();
  const rpcFixture = await startRpcFixtureServer();
  const apiPort = 3210;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const apiLogs: string[] = [];

  const apiProcess = spawn(
    "pnpm",
    ["exec", "tsx", "apps/api/src/index.ts"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PORT: String(apiPort),
        OPENAI_BASE_URL: "",
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "",
        ONCHAIN_RPC_URL: rpcFixture.url,
        ONCHAIN_RPC_BASE: rpcFixture.url
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const pushLog = (chunk: Buffer) => {
    apiLogs.push(chunk.toString("utf8"));
  };
  apiProcess.stdout?.on("data", pushLog);
  apiProcess.stderr?.on("data", pushLog);

  let createdTaskId: string | null = null;

  try {
    await waitForHealth(apiBaseUrl);

    const intakeResponse = await fetch(`${apiBaseUrl}/tasks/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: [
          { type: "url", value: fixture.url },
          { type: "url", value: fixtureContractAddress },
          { type: "text", value: "chain:base" },
          { type: "text", value: `pg smoke test ${Date.now()}` }
        ]
      })
    });
    const intakePayload = await readJson<{ taskId: string; projectName: string }>(intakeResponse);
    createdTaskId = intakePayload.taskId;

    assert.ok(createdTaskId, "taskId should be returned from intake");

    const tasksPayload = await readJson<{ items: Array<{ id: string }> }>(await fetch(`${apiBaseUrl}/tasks`));
    assert.ok(tasksPayload.items.some((item) => item.id === createdTaskId), "created task should appear in /tasks");

    const collectPayload = await readJson<{ evidenceCount: number; collectedSources: string[] }>(
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/collect-public`, { method: "POST" })
    );
    assert.equal(collectPayload.evidenceCount, 1, "collect-public should create one evidence record");
    assert.equal(collectPayload.collectedSources.length, 1, "collect-public should mark one source as collected");

    const onchainPayload = await readJson<{ evidenceCount: number; collectedContracts: string[] }>(
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/collect-onchain`, { method: "POST" })
    );
    assert.equal(onchainPayload.evidenceCount, 4, "collect-onchain should create four evidence records from the stub RPC");
    assert.equal(onchainPayload.collectedContracts[0], fixtureContractAddress, "collect-onchain should collect the fixture contract");

    const analyzePayload = await readJson<{
      factorResult: { analyzedFactors: number };
      reportResult: { finalScore: number };
      version: { versionId: string };
    }>(await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/analyze-factors`, { method: "POST" }));

    assert.equal(analyzePayload.factorResult.analyzedFactors, 20, "analyze-factors should produce all configured factors");
    assert.ok(analyzePayload.reportResult.finalScore >= 1, "report should have a bounded final score");
    assert.ok(analyzePayload.version.versionId, "analysis should create a version snapshot");

    const finalReportPayload = await readJson<{
      meta: { task_id: string };
      execution_summary: { final_score: number; risk_level: string };
    }>(await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/final-analysis-report`));

    assert.equal(finalReportPayload.meta.task_id, createdTaskId, "final report should match task id");
    assert.ok(finalReportPayload.execution_summary.final_score >= 1, "final report score should be present");
    assert.ok(finalReportPayload.execution_summary.risk_level.length > 0, "final report risk level should be present");

    const snapshotPayload = await readJson<{
      summary: { evidenceCount: number; factorCount: number; versionCount: number };
    }>(await fetch(`${apiBaseUrl}/tasks/${createdTaskId}`));

    assert.equal(snapshotPayload.summary.evidenceCount >= 5, true, "snapshot should include website and onchain evidence");
    assert.equal(snapshotPayload.summary.factorCount, 20, "snapshot should expose analyzed factors");
    assert.equal(snapshotPayload.summary.versionCount, 1, "snapshot should expose created version");

    const sourcesPayload = await readJson<{ items: Array<{ id: string; source_type: string; evidence_count: number }> }>(
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/sources`)
    );
    assert.equal(sourcesPayload.items.length, 2, "fixture task should expose website and contract sources");
    assert.ok(sourcesPayload.items.some((item) => item.source_type === "website" && item.evidence_count === 1), "website source should hold one evidence");
    assert.ok(sourcesPayload.items.some((item) => item.source_type === "contract" && item.evidence_count === 4), "contract source should hold four onchain evidences");

    const runsPayload = await readJson<{ items: Array<{ collector_key: string; status: string }> }>(
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/collection-runs`)
    );
    assert.ok(
      runsPayload.items.some((item) => item.collector_key === "public_web_fetch" && item.status === "completed"),
      "collection runs should record the public web fetch"
    );
    assert.ok(
      runsPayload.items.some((item) => item.collector_key === "onchain_rpc_provider" && item.status === "completed"),
      "collection runs should record the onchain collector"
    );

    const factorSnapshot = await readJson<{
      factors: Array<{ id: string; factor_name: string; final_score: number }>;
      summary: { versionCount: number };
    }>(await fetch(`${apiBaseUrl}/tasks/${createdTaskId}`));
    const factorToReview = factorSnapshot.factors.find((factor) => factor.factor_name === "官网完成度") ?? factorSnapshot.factors[0];
    assert.ok(factorToReview, "a factor should be available for review");

    const reviewPayload = await readJson<{
      factorId: string;
      finalScore: number;
      version: { versionId: string; versionType: string };
    }>(
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/review-factor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId: factorToReview.id,
          reviewer: "smoke-test",
          overrideScore: 8.5,
          overrideReason: "fixture review override"
        })
      })
    );

    assert.equal(reviewPayload.factorId, factorToReview.id, "review response should target the selected factor");
    assert.equal(reviewPayload.finalScore, 8.5, "review should apply the override score");
    assert.equal(reviewPayload.version.versionType, "human_revised", "review should create a human_revised version");

    const versionsPayload = await readJson<{ items: Array<{ id: string; version_type: string }> }>(
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/versions`)
    );
    assert.equal(versionsPayload.items.length, 2, "review should leave two versions on the task");
    assert.ok(versionsPayload.items.some((item) => item.version_type === "ai_initial"), "initial version should remain available");
    assert.ok(versionsPayload.items.some((item) => item.version_type === "human_revised"), "human revised version should be present");

    const humanVersion = versionsPayload.items.find((item) => item.version_type === "human_revised");
    assert.ok(humanVersion, "human revised version should exist");

    const versionDetailPayload = await readJson<{
      id: string;
      factor_snapshot: Array<{ id: string; final_score: number }>;
      report_snapshot: { final_score: number } | null;
    }>(await fetch(`${apiBaseUrl}/tasks/${createdTaskId}/versions/${humanVersion.id}`));
    assert.equal(versionDetailPayload.id, humanVersion.id, "version detail should match selected version");
    assert.ok(
      versionDetailPayload.factor_snapshot.some((factor) => factor.id === factorToReview.id && Number(factor.final_score) === 8.5),
      "version snapshot should capture the overridden factor score"
    );

    console.log(
      JSON.stringify({
        ok: true,
        taskId: createdTaskId,
        finalScore: finalReportPayload.execution_summary.final_score,
        reviewedFactorId: factorToReview.id
      })
    );
  } finally {
    if (createdTaskId) {
      await fetch(`${apiBaseUrl}/tasks/${createdTaskId}`, { method: "DELETE" }).catch(() => undefined);
    }

    fixture.server.close();
    rpcFixture.server.close();
    apiProcess.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (apiProcess.exitCode && apiProcess.exitCode !== 0) {
      console.error(apiLogs.join(""));
    }
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
