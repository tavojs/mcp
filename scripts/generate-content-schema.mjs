import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { contentManifestSchema } from "../dist/schemas/content.js";

const check = process.argv.includes("--check");
const target = new URL("../schemas/tavo-docs-v1.schema.json", import.meta.url);
const generated = z.toJSONSchema(contentManifestSchema, {
  target: "draft-2020-12",
});
const schema = {
  ...generated,
  $id: "https://tavo.dev/schemas/tavo-docs-v1.schema.json",
  title: "Tavo.js Public Documentation Manifest v1",
};
const serialized = `${JSON.stringify(schema, null, 2)}\n`;

if (check) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== serialized) {
    throw new Error(
      "The public documentation JSON Schema is stale. Run npm run schema:generate.",
    );
  }
  console.log("Documentation JSON Schema is current.");
} else {
  await mkdir(new URL("../schemas/", import.meta.url), { recursive: true });
  await writeFile(target, serialized);
  console.log("Generated schemas/tavo-docs-v1.schema.json.");
}
