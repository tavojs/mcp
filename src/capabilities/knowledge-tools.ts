import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContentStore } from "../content.js";
import { toolResult } from "../mcp/responses.js";
import { envelope, failure } from "../protocol.js";
import {
  findTavoComponentsInputSchema,
  findTavoComponentsOutputSchema,
  getTavoDocumentInputSchema,
  getTavoDocumentOutputSchema,
  lookupTavoApiInputSchema,
  lookupTavoApiOutputSchema,
  searchTavoInputSchema,
  searchTavoOutputSchema,
} from "../schemas/knowledge-tools.js";
import { TavoSearchIndex } from "../search.js";

export function registerKnowledgeTools(
  server: McpServer,
  store: ContentStore,
  search: TavoSearchIndex,
): void {
  server.registerTool(
    "search_tavo",
    {
      title: "Search Tavo.js",
      description:
        "Search public Tavo.js guides, APIs, UI components, and tokens.",
      inputSchema: searchTavoInputSchema,
      outputSchema: searchTavoOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, scope, limit, maxTokens }) => {
      const matches = search
        .search(query, scope, limit)
        .map(({ value: _value, ...match }) => match);
      return toolResult(
        envelope(
          { query, scope, matches },
          matches.map((match) => ({ uri: match.uri, title: match.title })),
          { maxTokens },
        ),
      );
    },
  );

  server.registerTool(
    "get_tavo_document",
    {
      title: "Get Tavo.js document",
      description:
        "Read a public Tavo.js documentation record by its stable ID.",
      inputSchema: getTavoDocumentInputSchema,
      outputSchema: getTavoDocumentOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ id, detail, maxTokens }) => {
      const document = store.documentsById.get(id);
      if (!document) {
        return toolResult(
          failure(
            "document-not-found",
            `Unknown Tavo.js document '${id}'.`,
            maxTokens,
          ),
        );
      }
      const data =
        detail === "summary"
          ? {
              id: document.id,
              title: document.title,
              description: document.description,
              keywords: document.keywords,
              kind: document.kind,
              prerequisites: document.prerequisites ?? [],
              outcomes: document.outcomes ?? [],
              runtime: document.runtime ?? [],
              related: document.related ?? [],
              canonicalPath: document.canonicalPath,
              sections: document.sections.map(({ id: sectionId, title }) => ({
                id: sectionId,
                title,
              })),
            }
          : document;
      const uri = `tavo://docs/${encodeURIComponent(id)}`;
      return toolResult(
        envelope(data, [{ uri, title: document.title }], {
          maxTokens,
          continuation: {
            resourceUri: uri,
            nextSection: document.sections[1]?.id,
          },
        }),
      );
    },
  );

  server.registerTool(
    "find_tavo_components",
    {
      title: "Find Tavo.js UI components",
      description:
        "Find Tavo.js UI components by intent, category, behavior, or accessibility need.",
      inputSchema: findTavoComponentsInputSchema,
      outputSchema: findTavoComponentsOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, category, detail, limit, maxTokens }) => {
      let matches = search.search(query, "components", limit * 2);
      if (category) {
        matches = matches.filter(
          (match) =>
            (match.value as { category?: string }).category === category,
        );
      }
      const components = matches.slice(0, limit).map((match) => {
        const component =
          match.value as (typeof store.manifest.components)[number];
        return detail === "full"
          ? component
          : {
              name: component.name,
              slug: component.slug,
              category: component.category,
              importPath: component.importPath,
              summary: component.summary,
              whenToUse: component.whenToUse,
              avoidWhen: component.avoidWhen,
              accessibility: component.accessibilityGuidance.summary,
              status: component.status,
              capability: component.capability,
              maturity: component.maturity,
              requiredImports: component.requiredImports,
              stateOwnership: component.stateOwnership,
              limitations: component.limitations,
              preview: component.preview,
            };
      });
      return toolResult(
        envelope(
          { query, category: category ?? null, components },
          components.map((component) => ({
            uri: `tavo://ui/components/${component.slug}`,
            title: component.name,
          })),
          { maxTokens },
        ),
      );
    },
  );

  server.registerTool(
    "lookup_tavo_api",
    {
      title: "Look up Tavo.js API",
      description:
        "Find public Framework or Tavo.js UI symbols and their entry points.",
      inputSchema: lookupTavoApiInputSchema,
      outputSchema: lookupTavoApiOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, package: packageName, limit, maxTokens }) => {
      const matches = search.search(
        query,
        "api",
        limit,
        packageName === "all" ? {} : { package: packageName },
      );
      const symbols = matches.map((match) => match.value);
      return toolResult(
        envelope(
          { query, package: packageName, symbols },
          matches.map((match) => ({ uri: match.uri, title: match.title })),
          { maxTokens },
        ),
      );
    },
  );
}
