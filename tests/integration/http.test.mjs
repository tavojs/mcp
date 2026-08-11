import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createTavoMcpRuntime } from "../../dist/runtime.js";
import { startHttpTransport } from "../../dist/transports/http.js";
import { packageVersion } from "../../dist/version.js";

const runtime = await createTavoMcpRuntime();

function startHttp(overrides = {}) {
  return startHttpTransport(runtime, {
    host: "127.0.0.1",
    port: 0,
    allowedHosts: ["127.0.0.1"],
    allowedOrigins: [],
    trustProxyHops: 0,
    rateLimitPerMinute: 100,
    logger: () => {},
    ...overrides,
  });
}

function rawRequest(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, headers }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (responseBody += chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: responseBody,
        }),
      );
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

test("serves documentation capabilities over stateless Streamable HTTP", async () => {
  const http = await startHttp();
  const client = new Client({ name: "tavo-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(http.url));

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    assert.ok(names.includes("search_tavo"));
    assert.ok(names.includes("get_tavo_document"));
    assert.ok(names.includes("find_tavo_components"));
    assert.ok(names.includes("lookup_tavo_api"));
    assert.ok(!names.includes("get_tavo_project_context"));
    assert.ok(!names.includes("inspect_tavo_project"));
    assert.ok(!names.includes("verify_tavo_project"));

    const resources = await client.listResources();
    assert.ok(
      resources.resources.some((resource) => resource.uri === "tavo://status"),
    );
    const prompts = await client.listPrompts();
    assert.ok(
      prompts.prompts.some((prompt) => prompt.name === "build-tavo-feature"),
    );

    const status = await client.readResource({ uri: "tavo://status" });
    const statusData = JSON.parse(status.contents[0].text);
    assert.equal(statusData.project.configured, false);

    const result = await client.callTool({
      name: "search_tavo",
      arguments: { query: "route loader", limit: 3, maxTokens: 256 },
    });
    assert.equal(result.isError, false);
    assert.ok(result.structuredContent.data.matches.length > 0);
    assert.ok(result.structuredContent.meta.estimatedTokens <= 256);
  } finally {
    await client.close();
    await http.close();
  }
});

test("exposes liveness and readiness without leaking runtime internals", async () => {
  const http = await startHttp();
  const baseUrl = http.url.replace(/\/mcp$/, "");
  try {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      service: "@tavojs/mcp",
      version: packageVersion,
    });

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    const readyData = await ready.json();
    assert.equal(readyData.status, "ready");
    assert.match(readyData.contentHash, /^[a-f0-9]{64}$/);
  } finally {
    await http.close();
  }
  await assert.rejects(fetch(`${baseUrl}/healthz`));
});

test("rejects invalid hosts and origins", async () => {
  const http = await startHttp({
    allowedOrigins: ["https://agents.tavo.dev"],
  });
  try {
    const invalidHost = await rawRequest(http.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "attacker.example",
      },
      body: "{}",
    });
    assert.equal(invalidHost.status, 403);
    assert.doesNotMatch(invalidHost.body, /attacker\.example/);

    const invalidOrigin = await fetch(http.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: "{}",
    });
    assert.equal(invalidOrigin.status, 403);

    const allowedOrigin = await fetch(http.url, {
      method: "GET",
      headers: { origin: "https://agents.tavo.dev" },
    });
    assert.equal(allowedOrigin.status, 405);
  } finally {
    await http.close();
  }
});

test("bounds request bodies and returns sanitized HTTP errors", async () => {
  const http = await startHttp();
  try {
    const malformed = await fetch(http.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal(
      (await malformed.json()).error.message,
      "Malformed JSON request body.",
    );

    const oversized = await fetch(http.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(101 * 1_024) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(
      (await oversized.json()).error.message,
      "Request body is too large.",
    );

    const unsupported = await fetch(http.url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x".repeat(101 * 1_024),
    });
    assert.equal(unsupported.status, 415);
    assert.equal(
      (await unsupported.json()).error.message,
      "Content-Type must be application/json.",
    );

    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(http.url, { method });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "POST");
    }
  } finally {
    await http.close();
  }
});

test("returns a bounded public error when server creation fails", async () => {
  const http = await startHttp({
    serverFactory: () => {
      throw new Error("internal secret path /private/service");
    },
  });
  try {
    const response = await fetch(http.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "failure-test", version: "1.0.0" },
        },
      }),
    });
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.match(body, /Internal server error/);
    assert.doesNotMatch(body, /secret|private\/service/);
  } finally {
    await http.close();
  }
});

test("rate limits MCP requests and emits standard retry metadata", async () => {
  const http = await startHttp({ rateLimitPerMinute: 2 });
  try {
    assert.equal((await fetch(http.url)).status, 405);
    assert.equal((await fetch(http.url)).status, 405);
    const limited = await fetch(http.url);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("ratelimit"));
    assert.ok(limited.headers.get("retry-after"));
    assert.equal(
      (await limited.json()).error.message,
      "Rate limit exceeded. Retry later.",
    );
  } finally {
    await http.close();
  }
});
