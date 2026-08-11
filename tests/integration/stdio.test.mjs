import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("serves tools, resources, prompts, and structured search results over stdio", async () => {
  const server = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    stderr: "pipe",
  });
  const client = new Client({ name: "tavo-mcp-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const searchTool = tools.tools.find((tool) => tool.name === "search_tavo");
    assert.ok(searchTool);
    assert.ok(
      searchTool.outputSchema.properties.data.anyOf.some(
        (schema) => schema.properties?.matches,
      ),
    );
    assert.ok(
      !tools.tools.some((tool) => tool.name === "inspect_tavo_project"),
    );

    const prompts = await client.listPrompts();
    assert.ok(
      prompts.prompts.some((prompt) => prompt.name === "build-tavo-feature"),
    );

    const resources = await client.listResources();
    assert.ok(
      resources.resources.some(
        (resource) => resource.uri === "tavo://docs/index",
      ),
    );
    assert.ok(
      resources.resources.some(
        (resource) => resource.uri === "tavo://ui/components/button",
      ),
    );
    assert.ok(
      !resources.resources.some(
        (resource) => resource.uri === "tavo://ui/components/carousel",
      ),
    );
    assert.ok(
      resources.resources.some((resource) => resource.uri === "tavo://status"),
    );

    const status = await client.readResource({ uri: "tavo://status" });
    const statusData = JSON.parse(status.contents[0].text);
    assert.equal(statusData.package.name, "@tavojs/mcp");
    assert.equal(statusData.manifest.schemaVersion, 1);
    assert.equal(statusData.project.configured, false);
    assert.equal(
      statusData.documentationCompatibility.status,
      "not-configured",
    );

    const response = await client.callTool({
      name: "search_tavo",
      arguments: {
        query: "define route page",
        scope: "all",
        limit: 5,
        maxTokens: 256,
      },
    });
    assert.equal(response.isError, false);
    assert.equal(response.structuredContent.schemaVersion, 1);
    assert.ok(response.structuredContent.data.matches.length > 0);
    assert.ok(response.structuredContent.meta.estimatedTokens <= 256);

    const document = await client.callTool({
      name: "get_tavo_document",
      arguments: {
        id: "getting-started:first-app",
        detail: "summary",
        maxTokens: 512,
      },
    });
    assert.equal(document.isError, false);
    assert.equal(document.structuredContent.data.kind, "quickstart");
    assert.deepEqual(document.structuredContent.data.runtime, [
      "browser",
      "server",
      "build",
    ]);
    assert.ok(document.structuredContent.data.outcomes.length > 0);

    const api = await client.callTool({
      name: "lookup_tavo_api",
      arguments: {
        query: "buildTheme",
        package: "ui",
        limit: 1,
        maxTokens: 512,
      },
    });
    assert.equal(api.isError, false);
    assert.equal(api.structuredContent.data.symbols[0].name, "buildTheme");
    assert.match(
      api.structuredContent.data.symbols[0].signature,
      /ThemeBuildResult/,
    );
  } finally {
    await client.close();
  }
});
