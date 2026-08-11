import assert from "node:assert/strict";
import test from "node:test";
import { ContentStore } from "../dist/content.js";
import { documentationCompatibility } from "../dist/version-compatibility.js";

test("reports installed packages that do not match the documentation snapshot", async () => {
  const store = await ContentStore.load();
  const cliVersion = store.manifest.sources.find(
    (source) => source.kind === "cli",
  )?.version;
  assert.ok(cliVersion);
  const report = documentationCompatibility(store, {
    "@tavojs/cli": cliVersion,
    "@tavojs/core": "9.0.0",
    "@tavojs/ui": null,
  });

  assert.equal(report.status, "mismatch");
  assert.equal(report.contentHash, store.manifest.contentHash);
  assert.equal(report.checks[0].status, "match");
  assert.equal(report.checks[1].status, "mismatch");
  assert.equal(report.checks[2].status, "unavailable");
  assert.match(report.warnings[0], /@tavojs\/core@9\.0\.0/);
});

test("reports an unconfigured project without a false warning", async () => {
  const store = await ContentStore.load();
  const report = documentationCompatibility(store);
  assert.equal(report.status, "not-configured");
  assert.deepEqual(report.warnings, []);
});
