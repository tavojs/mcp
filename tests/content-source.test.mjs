import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CONTENT_SOURCE_ENV,
  PUBLIC_CONTENT_SOURCE,
  readContentSource,
  resolveContentSource,
} from "../scripts/content-source.mjs";

test("resolves content sources by CLI, environment, then default precedence", () => {
  const fromCli = resolveContentSource({
    argv: ["--source=./cli.json"],
    env: { [CONTENT_SOURCE_ENV]: "./env.json" },
    cwd: "/workspace",
  });
  assert.deepEqual(fromCli, {
    kind: "file",
    value: "/workspace/cli.json",
    explicit: true,
  });

  const fromEnvironment = resolveContentSource({
    argv: [],
    env: { [CONTENT_SOURCE_ENV]: "https://example.com/docs.json" },
    cwd: "/workspace",
  });
  assert.equal(fromEnvironment.kind, "url");
  assert.equal(fromEnvironment.value.href, "https://example.com/docs.json");
  assert.equal(fromEnvironment.explicit, true);

  const fromDefault = resolveContentSource({
    argv: [],
    env: {},
    cwd: "/workspace/project",
  });
  assert.equal(fromDefault.kind, "url");
  assert.equal(fromDefault.value.href, PUBLIC_CONTENT_SOURCE);
  assert.equal(fromDefault.explicit, false);
  assert.equal(
    PUBLIC_CONTENT_SOURCE,
    "https://tavojs.dev/.well-known/tavo-docs-v1.json",
  );
});

test("rejects unsafe remote content sources", () => {
  assert.throws(
    () =>
      resolveContentSource({
        argv: ["--source=http://example.com/docs.json"],
        env: {},
      }),
    /must use HTTPS/,
  );
  assert.throws(
    () =>
      resolveContentSource({
        argv: ["--source=https://user:secret@example.com/docs.json"],
        env: {},
      }),
    /must not contain credentials/,
  );
});

test("reads local and remote content sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavo-content-source-"));
  const localPath = join(directory, "docs.json");
  await writeFile(localPath, '{"source":"file"}', "utf8");
  assert.equal(
    await readContentSource({ kind: "file", value: localPath }),
    '{"source":"file"}',
  );

  const remote = resolveContentSource({
    argv: ["--source=https://example.com/docs.json"],
    env: {},
  });
  const fetched = await readContentSource(remote, {
    fetchImpl: async (url, options) => {
      assert.equal(url.href, "https://example.com/docs.json");
      assert.equal(options.headers.accept, "application/json");
      return new Response('{"source":"url"}', {
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(fetched, '{"source":"url"}');
});
