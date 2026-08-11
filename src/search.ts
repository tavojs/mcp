import MiniSearch, { type SearchResult } from "minisearch";
import type { ContentStore } from "./content.js";

export type SearchScope = "all" | "docs" | "api" | "components" | "tokens";

type SearchRecord = {
  id: string;
  scope: Exclude<SearchScope, "all">;
  title: string;
  description: string;
  body: string;
  keywords: string;
  uri: string;
  packageName: "core" | "ui" | "";
  aliases: string[];
  value: unknown;
};

export type SearchFilters = {
  /** Restrict API results to one public Tavo.js package before ranking/limiting. */
  package?: "core" | "ui";
};

export type TavoSearchResult = {
  id: string;
  scope: SearchRecord["scope"];
  title: string;
  description: string;
  uri: string;
  score: number;
  value: unknown;
};

export class TavoSearchIndex {
  private readonly index: MiniSearch<SearchRecord>;

  constructor(store: ContentStore) {
    const records: SearchRecord[] = [
      ...store.manifest.documents.map((document) => ({
        id: `docs:${document.id}`,
        scope: "docs" as const,
        title: document.title,
        description: document.description,
        body: [
          document.kind ?? "",
          ...(document.prerequisites ?? []),
          ...(document.outcomes ?? []),
          ...(document.runtime ?? []),
          ...(document.related ?? []).flatMap((related) => [
            related.title,
            related.description,
            related.href,
          ]),
          ...document.sections.map(
            (section) => `${section.title}\n${section.markdown}`,
          ),
        ].join("\n"),
        keywords: document.keywords.join(" "),
        uri: `tavo://docs/${encodeURIComponent(document.id)}`,
        packageName: "" as const,
        aliases: document.keywords,
        value: document,
      })),
      ...store.apiRecords.map((record) => ({
        id: `api:${record.package}:${record.entrypoint}:${record.name}`,
        scope: "api" as const,
        title: record.name,
        description: record.description,
        body: [
          record.package,
          record.entrypoint,
          record.kind ?? "",
          record.signature ?? "",
          ...(record.runtime ?? []),
          record.stability ?? "",
          record.related ?? "",
        ].join(" "),
        keywords: `${record.package} API symbol export`,
        uri: `tavo://api/${encodeURIComponent(`${record.package}:${record.entrypoint}:${record.name}`)}`,
        packageName: record.package,
        aliases: [],
        value: record,
      })),
      ...store.manifest.components.map((component) => ({
        id: `component:${component.slug}`,
        scope: "components" as const,
        title: component.name,
        description: component.summary,
        body: [
          component.whenToUse,
          component.avoidWhen,
          component.importPath,
          ...component.props.map(
            (prop) => `${prop.name} ${prop.type} ${prop.description}`,
          ),
          ...component.examples.map(
            (example) => `${example.title} ${example.code}`,
          ),
          component.accessibilityGuidance.summary,
          ...component.accessibilityGuidance.checklist,
        ].join(" "),
        keywords: `${component.category} ${component.searchTerms.join(" ")}`,
        uri: `tavo://ui/components/${component.slug}`,
        packageName: "ui" as const,
        aliases: component.searchTerms,
        value: component,
      })),
      ...store.manifest.tokens.map((token) => ({
        id: `token:${token.name}`,
        scope: "tokens" as const,
        title: token.name,
        description: `${token.cssVariable} (${token.group})`,
        body: `${token.name} ${token.cssVariable} ${token.group}`,
        keywords: "theme token css variable",
        uri: `tavo://ui/tokens/${token.name}`,
        packageName: "ui" as const,
        aliases: [token.cssVariable],
        value: token,
      })),
    ];

    this.index = new MiniSearch<SearchRecord>({
      fields: ["title", "description", "body", "keywords"],
      storeFields: [
        "scope",
        "title",
        "description",
        "uri",
        "packageName",
        "aliases",
        "value",
      ],
      searchOptions: {
        boost: { title: 4, keywords: 2, description: 2 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
    this.index.addAll(records);
  }

  search(
    query: string,
    scope: SearchScope = "all",
    limit = 8,
    filters: SearchFilters = {},
  ): TavoSearchResult[] {
    const boundedLimit = Math.max(1, Math.min(limit, 20));
    const normalizedQuery = normalizeSearchText(query);
    const options = {
      filter: (searchResult: SearchResult) =>
        (scope === "all" || searchResult.scope === scope) &&
        (!filters.package || searchResult.packageName === filters.package),
    };
    return this.index
      .search(query, options)
      .map((result) => ({
        result,
        score: result.score + exactIntentBoost(normalizedQuery, result),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          String(left.result.id).localeCompare(String(right.result.id)),
      )
      .slice(0, boundedLimit)
      .map(({ result, score }) => ({
        id: String(result.id),
        scope: result.scope,
        title: result.title,
        description: result.description,
        uri: result.uri,
        score: Number(score.toFixed(3)),
        value: result.value,
      }));
  }
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function exactIntentBoost(query: string, result: SearchResult): number {
  if (!query) return 0;
  const title = normalizeSearchText(String(result.title));
  const id = normalizeSearchText(String(result.id).split(":").at(-1) ?? "");
  if (query === title || query === id) return 1000;

  const aliases = Array.isArray(result.aliases)
    ? result.aliases.map((alias) => normalizeSearchText(String(alias)))
    : [];
  if (aliases.includes(query)) return 500;

  const queryTerms = new Set(query.split(" "));
  const titleTerms = title.split(" ");
  if (
    titleTerms.length > 0 &&
    titleTerms.every((term) => queryTerms.has(term))
  ) {
    return 100;
  }
  if (
    aliases.some((alias) =>
      alias.split(" ").every((term) => queryTerms.has(term)),
    )
  ) {
    return 50;
  }
  return 0;
}
