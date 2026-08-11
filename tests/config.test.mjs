import assert from "node:assert/strict";
import test from "node:test";
import { parseServerConfig } from "../dist/config.js";

test("uses backward-compatible stdio and safe HTTP defaults", () => {
  const config = parseServerConfig([], {});
  assert.equal(config.transport, "stdio");
  assert.equal(config.http.host, "127.0.0.1");
  assert.equal(config.http.port, 3_000);
  assert.deepEqual(config.http.allowedHosts, [
    "127.0.0.1",
    "localhost",
    "[::1]",
  ]);
  assert.deepEqual(config.http.allowedOrigins, []);
  assert.equal(config.http.trustProxyHops, 0);
  assert.equal(config.http.rateLimitPerMinute, 60);
});

test("lets CLI values override environment and supports repeated allowlists", () => {
  const config = parseServerConfig(
    [
      "--transport",
      "http",
      "--host",
      "0.0.0.0",
      "--port",
      "4500",
      "--allowed-host",
      "mcp.tavojs.dev",
      "--allowed-host",
      "127.0.0.1",
      "--allowed-origin",
      "https://agents.tavo.dev/",
      "--trust-proxy-hops",
      "1",
      "--rate-limit-per-minute",
      "120",
    ],
    {
      TAVO_MCP_TRANSPORT: "stdio",
      TAVO_MCP_PORT: "4000",
      PORT: "5000",
      TAVO_MCP_ALLOWED_HOSTS: "ignored.example",
      TAVO_MCP_ALLOWED_ORIGINS: "https://ignored.example",
    },
  );
  assert.equal(config.transport, "http");
  assert.equal(config.http.host, "0.0.0.0");
  assert.equal(config.http.port, 4_500);
  assert.deepEqual(config.http.allowedHosts, ["mcp.tavojs.dev", "127.0.0.1"]);
  assert.deepEqual(config.http.allowedOrigins, ["https://agents.tavo.dev"]);
  assert.equal(config.http.trustProxyHops, 1);
  assert.equal(config.http.rateLimitPerMinute, 120);
});

test("uses TAVO_MCP_PORT before conventional PORT", () => {
  assert.equal(
    parseServerConfig([], { TAVO_MCP_PORT: "4100", PORT: "4200" }).http.port,
    4_100,
  );
  assert.equal(parseServerConfig([], { PORT: "4200" }).http.port, 4_200);
});

test("rejects unsafe HTTP and project combinations", () => {
  assert.throws(
    () =>
      parseServerConfig(["--transport", "http", "--project", "/tmp/app"], {}),
    /documentation-only/,
  );
  assert.throws(
    () =>
      parseServerConfig(["--transport", "http", "--max-concurrency", "2"], {}),
    /documentation-only/,
  );
  assert.throws(
    () => parseServerConfig(["--transport", "http", "--host", "0.0.0.0"], {}),
    /requires at least one --allowed-host/,
  );
});

test("validates option syntax and numeric bounds", () => {
  assert.throws(
    () => parseServerConfig(["--port", "0"], {}),
    /between 1 and 65535/,
  );
  assert.throws(
    () => parseServerConfig(["--trust-proxy-hops", "11"], {}),
    /between 0 and 10/,
  );
  assert.throws(
    () =>
      parseServerConfig(["--allowed-origin", "https://example.com/path"], {}),
    /Invalid allowed origin/,
  );
  assert.throws(
    () => parseServerConfig(["--unknown", "value"], {}),
    /Unknown option/,
  );
  assert.throws(() => parseServerConfig(["--port"], {}), /requires a value/);
});
