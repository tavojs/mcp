import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("documents bounded project-runner options in CLI help", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    new URL("../dist/index.js", import.meta.url).pathname,
    "--help",
  ]);
  assert.match(stdout, /--timeout-ms <100-60000>/);
  assert.match(stdout, /--max-output-bytes <1024-1048576>/);
  assert.match(stdout, /--max-concurrency <1-4>/);
  assert.match(stdout, /--transport <stdio\|http>/);
  assert.match(stdout, /--port <1-65535>/);
  assert.match(stdout, /--allowed-host <hostname>/);
  assert.match(stdout, /HTTP transport is documentation-only/);
});
