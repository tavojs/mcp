import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ContentStore } from "../../dist/content.js";

test("adds only allowlisted project tools when a Tavo.js project is configured", async () => {
  const store = await ContentStore.load();
  const cliVersion = store.manifest.sources.find(
    (source) => source.kind === "cli",
  )?.version;
  assert.ok(cliVersion);
  const root = await mkdtemp(path.join(os.tmpdir(), "tavo-mcp-project-"));
  const packageRoot = path.join(root, "node_modules", "@tavojs", "cli");
  const cliDir = path.join(packageRoot, "dist");
  await mkdir(cliDir, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@tavojs/cli",
      version: cliVersion,
      type: "module",
    }),
  );
  await writeFile(
    path.join(cliDir, "tavo.mjs"),
    "console.log(JSON.stringify({ schemaVersion: 1, command: process.argv[2], ok: true, project: { fingerprint: '0123456789abcdef' }, data: { args: process.argv.slice(2) }, diagnostics: [], nextActions: [], metrics: { durationMs: 1, bytes: 1, estimatedTokens: 1 } }));\n",
  );

  const server = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server, "--project", root],
    stderr: "pipe",
  });
  const client = new Client({ name: "tavo-project-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.ok(names.includes("get_tavo_project_context"));
    assert.ok(names.includes("inspect_tavo_project"));
    assert.ok(names.includes("verify_tavo_project"));
    assert.ok(
      !names.some(
        (name) => name.includes("change") || name.includes("generate"),
      ),
    );

    const response = await client.callTool({
      name: "inspect_tavo_project",
      arguments: { kind: "route", target: "/account" },
    });
    assert.equal(response.isError, false);
    assert.equal(response.structuredContent.data.command, "inspect");
    assert.equal(
      response.structuredContent.data.documentationCompatibility.status,
      "compatible",
    );
    assert.equal(
      response.structuredContent.data.documentationCompatibility.checks[0]
        .packageName,
      "@tavojs/cli",
    );
    assert.equal(response.structuredContent.meta.maxTokens, 2_048);
  } finally {
    await client.close();
  }
});
