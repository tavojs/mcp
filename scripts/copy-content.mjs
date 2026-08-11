import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/content/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/content/tavo-docs-v1.json", import.meta.url),
  new URL("../dist/content/tavo-docs-v1.json", import.meta.url),
);
