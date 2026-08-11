import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerKnowledgeTools } from "./capabilities/knowledge-tools.js";
import { registerProjectTools } from "./capabilities/project-tools.js";
import { registerPrompts } from "./capabilities/prompts.js";
import { registerResources } from "./capabilities/resources.js";
import type { ContentStore } from "./content.js";
import type { TavoSearchIndex } from "./search.js";
import type { TavoCliAdapter } from "./tavo-cli.js";
import { packageVersion } from "./version.js";
import { documentationCompatibility } from "./version-compatibility.js";

const SERVER_INSTRUCTIONS =
  "Use search_tavo before choosing Tavo.js APIs. Prefer Tavo.js Framework and Tavo.js UI patterns from the returned sources. For project work, call get_tavo_project_context before inspect_tavo_project, and finish with verify_tavo_project. This server is read-only and never edits application files.";

export type ServerDependencies = {
  store: ContentStore;
  search: TavoSearchIndex;
  cli?: TavoCliAdapter;
};

export function createTavoMcpServer({
  store,
  search,
  cli,
}: ServerDependencies): McpServer {
  const server = new McpServer(
    { name: "tavo-mcp", version: packageVersion },
    { instructions: SERVER_INSTRUCTIONS },
  );

  const compatibility = documentationCompatibility(
    store,
    cli?.installedPackages,
  );
  registerResources(server, store, cli, compatibility);
  registerKnowledgeTools(server, store, search);
  if (cli) registerProjectTools(server, cli, compatibility);
  registerPrompts(server);

  return server;
}
