import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_CONTENT_SOURCE,
  readContentSource,
  resolveContentSource,
} from "./content-source.mjs";

const check = process.argv.includes("--check");
const target = new URL("../src/content/tavo-docs-v1.json", import.meta.url);
const source = resolveContentSource({
  defaultSource: check ? fileURLToPath(target) : PUBLIC_CONTENT_SOURCE,
});
const incoming = await readContentSource(source);
const parsed = JSON.parse(incoming);

if (
  parsed.schemaVersion !== 1 ||
  !/^[a-f0-9]{64}$/.test(parsed.contentHash ?? "")
) {
  throw new Error(
    "The website documentation manifest is not a supported v1 export.",
  );
}

const { contentHash, ...payload } = parsed;
const actualHash = createHash("sha256")
  .update(JSON.stringify(payload))
  .digest("hex");
if (contentHash !== actualHash) {
  throw new Error("The documentation manifest content hash is invalid.");
}

if (check) {
  const current = await readFile(target, "utf8");
  if (current !== incoming) {
    throw new Error(
      "Bundled Tavo.js documentation is stale. Run npm run sync:content.",
    );
  }
  console.log(`Content is current (${parsed.contentHash.slice(0, 12)}).`);
} else {
  await writeFile(target, incoming);
  console.log(
    `Synced ${parsed.documents.length} documents (${parsed.contentHash.slice(0, 12)}).`,
  );
}
