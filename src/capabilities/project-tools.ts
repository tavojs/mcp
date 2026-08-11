import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolResult } from "../mcp/responses.js";
import { envelope, failure } from "../protocol.js";
import {
  getProjectContextInputSchema,
  inspectProjectInputSchema,
  projectToolOutputSchema,
  verifyProjectInputSchema,
} from "../schemas/project-tools.js";
import type { TavoCliAdapter } from "../tavo-cli.js";
import type { DocumentationCompatibility } from "../version-compatibility.js";

type ToolSource = { uri: string; title: string };

async function runProjectCommand(
  operation: () => Promise<unknown>,
  maxTokens: number,
  compatibility: DocumentationCompatibility,
  sources: ToolSource[] = [],
  continuation?: { resourceUri: string },
) {
  try {
    const result = await operation();
    const compatibleResult =
      typeof result === "object" && result !== null && !Array.isArray(result)
        ? { ...result, documentationCompatibility: compatibility }
        : result;
    return toolResult(
      envelope(compatibleResult, sources, {
        maxTokens,
        ...(continuation ? { continuation } : {}),
      }),
    );
  } catch (error) {
    return toolResult(
      failure(
        "tavo-cli-failed",
        error instanceof Error ? error.message : String(error),
        maxTokens,
      ),
    );
  }
}

export function registerProjectTools(
  server: McpServer,
  cli: TavoCliAdapter,
  compatibility: DocumentationCompatibility,
): void {
  server.registerTool(
    "get_tavo_project_context",
    {
      title: "Get Tavo.js project context",
      description:
        "Read task-focused machine context from the configured Tavo.js application.",
      inputSchema: getProjectContextInputSchema,
      outputSchema: projectToolOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ maxTokens, ...input }) =>
      runProjectCommand(
        () => cli.getContext(input),
        maxTokens,
        compatibility,
        [{ uri: "tavo://project/context", title: "Project context" }],
        { resourceUri: "tavo://project/context" },
      ),
  );

  server.registerTool(
    "inspect_tavo_project",
    {
      title: "Inspect Tavo.js project target",
      description:
        "Inspect a route, component, store, file, or API in the configured project.",
      inputSchema: inspectProjectInputSchema,
      outputSchema: projectToolOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ kind, target, maxTokens }) =>
      runProjectCommand(
        () => cli.inspect(kind, target),
        maxTokens,
        compatibility,
      ),
  );

  server.registerTool(
    "verify_tavo_project",
    {
      title: "Verify Tavo.js project",
      description:
        "Run read-only Tavo.js diagnostics without invoking project package scripts.",
      inputSchema: verifyProjectInputSchema,
      outputSchema: projectToolOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ maxTokens, ...input }) =>
      runProjectCommand(() => cli.verify(input), maxTokens, compatibility),
  );
}
