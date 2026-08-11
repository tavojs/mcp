import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  contentManifestSchema,
  type ComponentRecord,
  type ContentDocument,
  type ContentManifest,
} from "./schemas/content.js";

const bundledManifest = new URL("./content/tavo-docs-v1.json", import.meta.url);

type ApiSymbol = ContentManifest["api"]["core"][number]["symbols"][number];

export type ApiRecord = ApiSymbol & {
  package: "core" | "ui";
  entrypoint: string;
};

export class ContentStore {
  readonly manifest: ContentManifest;
  readonly documentsById: Map<string, ContentDocument>;
  readonly componentsBySlug: Map<string, ComponentRecord>;
  readonly tokensByName: Map<string, ContentManifest["tokens"][number]>;
  readonly apiRecords: ApiRecord[];

  constructor(manifest: ContentManifest) {
    this.manifest = manifest;
    this.documentsById = new Map(
      manifest.documents.map((item) => [item.id, item]),
    );
    this.componentsBySlug = new Map(
      manifest.components.map((item) => [item.slug, item]),
    );
    this.tokensByName = new Map(
      manifest.tokens.map((item) => [item.name, item]),
    );
    this.apiRecords = (["core", "ui"] as const).flatMap((packageName) =>
      manifest.api[packageName].flatMap((entry) =>
        entry.symbols.map((symbol) => ({
          package: packageName,
          entrypoint: entry.entrypoint,
          ...symbol,
        })),
      ),
    );
  }

  static async load(
    path = fileURLToPath(bundledManifest),
  ): Promise<ContentStore> {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!raw || typeof raw !== "object" || !("contentHash" in raw)) {
      throw new Error(
        "The bundled Tavo.js documentation manifest has no content hash.",
      );
    }
    const { contentHash, ...payload } = raw as Record<string, unknown>;
    const actualHash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    if (contentHash !== actualHash) {
      throw new Error(
        "The bundled Tavo.js documentation manifest failed its content hash check.",
      );
    }
    const manifest = contentManifestSchema.parse(raw);
    return new ContentStore(manifest);
  }

  get index() {
    return {
      schemaVersion: this.manifest.schemaVersion,
      contentHash: this.manifest.contentHash,
      sources: this.manifest.sources,
      counts: {
        documents: this.manifest.documents.length,
        apiSymbols: this.apiRecords.length,
        components: this.manifest.components.length,
        tokens: this.manifest.tokens.length,
      },
      sections: [
        ...new Set(this.manifest.documents.map((item) => item.section)),
      ],
    };
  }
}
