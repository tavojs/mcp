import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes a versioned JSON Schema for the documentation contract", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../schemas/tavo-docs-v1.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "https://tavo.dev/schemas/tavo-docs-v1.schema.json");
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(
    new Set(schema.required),
    new Set([
      "schemaVersion",
      "contentHash",
      "generatedAt",
      "sources",
      "documents",
      "api",
      "components",
      "tokens",
      "commands",
    ]),
  );
});
