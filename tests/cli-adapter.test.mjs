import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TavoCliAdapter } from "../dist/tavo-cli.js";

const envelopeScript = `
const command = process.argv[2];
const envelope = {
  schemaVersion: 1,
  command,
  ok: true,
  project: { fingerprint: "0123456789abcdef" },
  data: { cwd: process.cwd(), args: process.argv.slice(2) },
  diagnostics: [],
  nextActions: [],
  metrics: { durationMs: 1, bytes: 1, estimatedTokens: 1 }
};
console.log(JSON.stringify(envelope));
`;

async function fixture(script = envelopeScript, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tavo-mcp-cli-"));
  const packageRoot = path.join(root, "node_modules", "@tavojs", "cli");
  const cliDir = path.join(packageRoot, "dist");
  await mkdir(cliDir, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "@tavojs/cli", version: "0.0.0" }),
  );
  await writeFile(path.join(cliDir, "tavo.mjs"), script);
  return { root, adapter: await TavoCliAdapter.create(root, options) };
}

test("invokes only the project-local Tavo.js executable", async () => {
  const { adapter } = await fixture();
  assert.equal(adapter.installedPackages["@tavojs/cli"], "0.0.0");
  assert.equal(adapter.installedPackages["@tavojs/core"], null);
  const output = await adapter.getContext({
    task: "modify-route",
    target: "/account",
  });
  assert.equal(output.data.cwd, adapter.projectRoot);
  assert.deepEqual(output.data.args, [
    "agent-context",
    "--json",
    "--task",
    "modify-route",
    "--target",
    "/account",
  ]);
});

test("accepts a workspace-linked package with a trusted manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tavo-mcp-workspace-"));
  const workspace = await mkdtemp(path.join(os.tmpdir(), "tavo-cli-package-"));
  await mkdir(path.join(workspace, "dist"), { recursive: true });
  await writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "@tavojs/cli", version: "0.0.0" }),
  );
  await writeFile(path.join(workspace, "dist", "tavo.mjs"), envelopeScript);
  await mkdir(path.join(root, "node_modules", "@tavojs"), { recursive: true });
  await symlink(workspace, path.join(root, "node_modules", "@tavojs", "cli"));
  const adapter = await TavoCliAdapter.create(root);
  assert.equal((await adapter.getContext({})).command, "agent-context");
});

test("rejects an executable whose package is not named @tavojs/cli", async () => {
  const { root } = await fixture();
  await writeFile(
    path.join(root, "node_modules", "@tavojs", "cli", "package.json"),
    JSON.stringify({ name: "lookalike" }),
  );
  await assert.rejects(TavoCliAdapter.create(root), /does not belong/);
});

test("rejects file traversal before invoking Tavo.js", async () => {
  const { adapter } = await fixture();
  await assert.rejects(
    adapter.inspect("file", "../../secrets.txt"),
    /project-relative/,
  );
  await assert.rejects(
    adapter.inspect("file", "/etc/passwd"),
    /project-relative/,
  );
  await assert.rejects(
    adapter.verify({ files: ["C:\\Windows\\secret.txt"] }),
    /project-relative/,
  );
  await assert.rejects(
    adapter.verify({ files: ["src/../secrets.txt"] }),
    /project-relative/,
  );
});

test("rejects file targets that escape through a symlink", async () => {
  const { root, adapter } = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "tavo-mcp-outside-"));
  await symlink(outside, path.join(root, "escaped"));
  await assert.rejects(
    adapter.inspect("file", "escaped/secret.ts"),
    /escapes the configured project root/,
  );
  await assert.rejects(
    adapter.verify({ files: ["escaped/new-file.ts"] }),
    /escapes the configured project root/,
  );
});

test("validates protocol JSON and the expected command", async () => {
  const malformed = await fixture("console.log('{nope');");
  await assert.rejects(malformed.adapter.getContext({}), /malformed JSON/);

  const wrongVersion = await fixture(
    envelopeScript.replace("schemaVersion: 1", "schemaVersion: 2"),
  );
  await assert.rejects(
    wrongVersion.adapter.getContext({}),
    /invalid protocol v1/,
  );

  const wrongCommand = await fixture(
    envelopeScript.replace("command,", 'command: "verify",'),
  );
  await assert.rejects(
    wrongCommand.adapter.inspect("api", "createTavo"),
    /for 'inspect'/,
  );
});

test("returns a valid protocol envelope from a nonzero CLI exit", async () => {
  const { adapter } = await fixture(
    envelopeScript.replace("ok: true", "ok: false") + "process.exitCode = 1;\n",
  );
  const output = await adapter.verify({});
  assert.equal(output.ok, false);
  assert.equal(output.command, "verify");
});

test("verification never invokes project package scripts", async () => {
  const { adapter } = await fixture();
  const output = await adapter.verify({
    files: ["src/pages/index.tsx"],
    smoke: true,
  });
  assert.deepEqual(output.data.args, [
    "verify",
    "--no-project-scripts",
    "--json",
    "--files",
    "src/pages/index.tsx",
    "--smoke",
  ]);
});

test("enforces configurable timeout bounds and terminates slow commands", async () => {
  const slowScript = `setTimeout(() => { ${envelopeScript} }, 1000);`;
  const { adapter } = await fixture(slowScript, { timeoutMs: 100 });
  await assert.rejects(adapter.getContext({}), /timed out after 100ms/);
  const { root } = await fixture();
  await assert.rejects(
    TavoCliAdapter.create(root, { timeoutMs: 60_001 }),
    /between 100 and 60000/,
  );
});

test("bounds oversized output and sanitizes stderr", async () => {
  const oversized = await fixture(`process.stdout.write("x".repeat(4096));`, {
    maxOutputBytes: 1024,
  });
  await assert.rejects(oversized.adapter.getContext({}), /command failed/);

  const noisy = await fixture(
    `console.error("\\u001b[31mboom\\u001b[0m\\napi_key=super-secret " + "x".repeat(3000)); process.exit(2);`,
  );
  await assert.rejects(noisy.adapter.getContext({}), (error) => {
    assert.doesNotMatch(error.message, /super-secret|\u001b/);
    assert.match(error.message, /api_key=\[redacted\]/);
    assert.ok(error.message.length < 2_200);
    return true;
  });
});

test("limits concurrent CLI processes", async () => {
  const script = `
const fs = await import("node:fs");
const statePath = process.argv[process.argv.indexOf("--target") + 1];
fs.appendFileSync(statePath, "start\\n");
await new Promise((resolve) => setTimeout(resolve, 120));
fs.appendFileSync(statePath, "end\\n");
${envelopeScript}
`;
  const { root, adapter } = await fixture(script, { maxConcurrency: 2 });
  const statePath = path.join(root, "state.json");
  await writeFile(statePath, "");
  await Promise.all(
    Array.from({ length: 5 }, () => adapter.getContext({ target: statePath })),
  );
  const events = (
    await (await import("node:fs/promises")).readFile(statePath, "utf8")
  )
    .trim()
    .split("\n");
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event === "start" ? 1 : -1;
    maximum = Math.max(maximum, active);
  }
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});

test("fails clearly when the project has no local Tavo.js CLI", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tavo-mcp-empty-"));
  await assert.rejects(
    TavoCliAdapter.create(root),
    /No project-local Tavo.js CLI/,
  );
});
