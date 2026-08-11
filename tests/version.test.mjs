import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { packageVersion, getPackageVersion } from "../dist/version.js";

test("derives the server version from package.json", async () => {
  const metadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(getPackageVersion(), metadata.version);
  assert.equal(packageVersion, metadata.version);
  assert.match(packageVersion, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
});
