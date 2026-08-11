import {
  type McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContentStore } from "../content.js";
import { jsonResource } from "../mcp/responses.js";
import type { TavoCliAdapter } from "../tavo-cli.js";
import { packageVersion } from "../version.js";
import type { DocumentationCompatibility } from "../version-compatibility.js";

export function registerResources(
  server: McpServer,
  store: ContentStore,
  cli?: TavoCliAdapter,
  compatibility?: DocumentationCompatibility,
): void {
  const status = {
    package: { name: "@tavojs/mcp", version: packageVersion },
    manifest: {
      schemaVersion: store.manifest.schemaVersion,
      contentHash: store.manifest.contentHash,
      sources: store.manifest.sources,
    },
    project: {
      configured: Boolean(cli),
      rootStatus: cli ? "configured" : "not-configured",
      tavoProtocolVersion: cli ? 1 : null,
      installedPackages: cli?.installedPackages ?? null,
    },
    documentationCompatibility: compatibility,
  };

  server.registerResource(
    "tavo-server-status",
    "tavo://status",
    {
      title: "Tavo.js MCP status",
      description:
        "MCP package, documentation snapshot, and project capability versions.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, status),
  );

  server.registerResource(
    "tavo-documentation-index",
    "tavo://docs/index",
    {
      title: "Tavo.js documentation index",
      description:
        "Versioned inventory of bundled public Tavo.js documentation.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, store.index),
  );

  server.registerResource(
    "tavo-documents",
    new ResourceTemplate("tavo://docs/{id}", {
      list: async () => ({
        resources: store.manifest.documents.map((document) => ({
          uri: `tavo://docs/${encodeURIComponent(document.id)}`,
          name: document.title,
          description: document.description,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Tavo.js documentation page",
      description: "A public task-oriented Tavo.js documentation page.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const id = decodeURIComponent(String(variables.id));
      const document = store.documentsById.get(id);
      if (!document) throw new Error(`Unknown Tavo.js document '${id}'.`);
      return jsonResource(uri, document);
    },
  );

  server.registerResource(
    "tavo-ui-components",
    new ResourceTemplate("tavo://ui/components/{slug}", {
      list: async () => ({
        resources: store.manifest.components.map((component) => ({
          uri: `tavo://ui/components/${component.slug}`,
          name: component.name,
          description: component.summary,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Tavo.js UI component",
      description:
        "Component API, usage, examples, and accessibility guidance.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const slug = String(variables.slug);
      const component = store.componentsBySlug.get(slug);
      if (!component)
        throw new Error(`Unknown Tavo.js UI component '${slug}'.`);
      return jsonResource(uri, component);
    },
  );

  server.registerResource(
    "tavo-ui-tokens",
    new ResourceTemplate("tavo://ui/tokens/{name}", {
      list: async () => ({
        resources: store.manifest.tokens.map((token) => ({
          uri: `tavo://ui/tokens/${token.name}`,
          name: token.name,
          description: `${token.cssVariable} (${token.group})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Tavo.js UI token",
      description: "A public Tavo.js UI semantic token.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const name = String(variables.name);
      const token = store.tokensByName.get(name);
      if (!token) throw new Error(`Unknown Tavo.js UI token '${name}'.`);
      return jsonResource(uri, token);
    },
  );

  server.registerResource(
    "tavo-api-symbols",
    new ResourceTemplate("tavo://api/{key}", {
      list: async () => ({
        resources: store.apiRecords.map((api) => ({
          uri: `tavo://api/${encodeURIComponent(`${api.package}:${api.entrypoint}:${api.name}`)}`,
          name: api.name,
          description: api.description,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Tavo.js API symbol",
      description: "A public Framework or UI API symbol.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const key = decodeURIComponent(String(variables.key));
      const api = store.apiRecords.find(
        (item) => `${item.package}:${item.entrypoint}:${item.name}` === key,
      );
      if (!api) throw new Error(`Unknown Tavo.js API symbol '${key}'.`);
      return jsonResource(uri, api);
    },
  );

  if (cli) {
    server.registerResource(
      "tavo-project-context",
      "tavo://project/context",
      {
        title: "Tavo.js project context",
        description:
          "Compact machine context for the configured Tavo.js application.",
        mimeType: "application/json",
      },
      async (uri) => {
        const context = await cli.getContext({ detail: "summary" });
        return jsonResource(
          uri,
          typeof context === "object" && context !== null
            ? { ...context, documentationCompatibility: compatibility }
            : context,
        );
      },
    );
  }
}
