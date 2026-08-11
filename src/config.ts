import type { TavoCliAdapterOptions } from "./tavo-cli.js";

export type TransportMode = "stdio" | "http";

export type HttpConfig = {
  host: string;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  trustProxyHops: number;
  rateLimitPerMinute: number;
};

export type ServerConfig = {
  transport: TransportMode;
  contentPath?: string | undefined;
  projectPath?: string | undefined;
  cliOptions: TavoCliAdapterOptions;
  http: HttpConfig;
};

type Environment = Record<string, string | undefined>;

const VALUE_FLAGS = new Set([
  "--transport",
  "--content",
  "--project",
  "--timeout-ms",
  "--max-output-bytes",
  "--max-concurrency",
  "--host",
  "--port",
  "--allowed-host",
  "--allowed-origin",
  "--trust-proxy-hops",
  "--rate-limit-per-minute",
]);

const REPEATABLE_FLAGS = new Set(["--allowed-host", "--allowed-origin"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DEFAULT_ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

export const HELP_TEXT =
  "Usage: tavo-mcp [--transport <stdio|http>] [--content <manifest.json>] [--project <path>]\n" +
  "                [--timeout-ms <100-60000>] [--max-output-bytes <1024-1048576>] [--max-concurrency <1-4>]\n" +
  "                [--host <host>] [--port <1-65535>] [--allowed-host <hostname>] [--allowed-origin <origin>]\n" +
  "                [--trust-proxy-hops <0-10>] [--rate-limit-per-minute <1-10000>]\n\n" +
  "The default stdio transport supports public documentation and optional local project inspection.\n" +
  "HTTP transport is documentation-only and serves MCP at /mcp with health checks at /healthz and /readyz.\n";

function parseArguments(args: string[]): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]!;
    if (name === "--help") continue;
    if (!VALUE_FLAGS.has(name)) {
      throw new Error(`Unknown option '${name}'.`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`);
    }
    const values = parsed.get(name) ?? [];
    if (!REPEATABLE_FLAGS.has(name) && values.length > 0) {
      throw new Error(`${name} may only be provided once.`);
    }
    values.push(value);
    parsed.set(name, values);
    index += 1;
  }
  return parsed;
}

function flagValue(
  parsed: Map<string, string[]>,
  name: string,
): string | undefined {
  return parsed.get(name)?.[0];
}

function configuredValue(
  parsed: Map<string, string[]>,
  name: string,
  environmentValue: string | undefined,
): string | undefined {
  const value = (flagValue(parsed, name) ?? environmentValue)?.trim();
  return value || undefined;
}

function integerValue(
  name: string,
  raw: string | undefined,
  minimum: number,
  maximum: number,
  fallback?: number,
): number | undefined {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function configuredList(
  parsed: Map<string, string[]>,
  name: string,
  environmentValue: string | undefined,
): string[] {
  const flagValues = parsed.get(name);
  if (flagValues) {
    return flagValues.map((value) => value.trim()).filter(Boolean);
  }
  return (environmentValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeAllowedHost(value: string): string {
  if (!value || value.includes("/") || value.includes("://")) {
    throw new Error(
      `Invalid allowed host '${value}'. Use a hostname without a scheme or path.`,
    );
  }
  try {
    const url = new URL(`http://${value}`);
    if (url.port) throw new Error("ports are not allowed");
    return url.hostname;
  } catch {
    throw new Error(
      `Invalid allowed host '${value}'. Use a hostname without a port.`,
    );
  }
}

function normalizeAllowedOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      throw new Error("invalid origin");
    }
    return url.origin;
  } catch {
    throw new Error(
      `Invalid allowed origin '${value}'. Use an http(s) origin without a path.`,
    );
  }
}

function parseTransport(value: string | undefined): TransportMode {
  const transport = value ?? "stdio";
  if (transport !== "stdio" && transport !== "http") {
    throw new Error("--transport must be either 'stdio' or 'http'.");
  }
  return transport;
}

export function parseServerConfig(
  args: string[],
  env: Environment = process.env,
): ServerConfig {
  const parsed = parseArguments(args);
  const transport = parseTransport(
    configuredValue(parsed, "--transport", env.TAVO_MCP_TRANSPORT),
  );
  const contentPath = configuredValue(
    parsed,
    "--content",
    env.TAVO_MCP_CONTENT,
  );
  const projectPath = configuredValue(
    parsed,
    "--project",
    env.TAVO_MCP_PROJECT,
  );
  const timeoutMs = integerValue(
    "--timeout-ms",
    configuredValue(parsed, "--timeout-ms", env.TAVO_MCP_TIMEOUT_MS),
    100,
    60_000,
  );
  const maxOutputBytes = integerValue(
    "--max-output-bytes",
    configuredValue(
      parsed,
      "--max-output-bytes",
      env.TAVO_MCP_MAX_OUTPUT_BYTES,
    ),
    1_024,
    1_048_576,
  );
  const maxConcurrency = integerValue(
    "--max-concurrency",
    configuredValue(parsed, "--max-concurrency", env.TAVO_MCP_MAX_CONCURRENCY),
    1,
    4,
  );

  if (
    transport === "http" &&
    (projectPath ||
      timeoutMs !== undefined ||
      maxOutputBytes !== undefined ||
      maxConcurrency !== undefined)
  ) {
    throw new Error(
      "HTTP transport is documentation-only; --project and project-runner options are not allowed.",
    );
  }

  const host =
    configuredValue(parsed, "--host", env.TAVO_MCP_HOST) ?? "127.0.0.1";
  if (!host || host.includes("/") || host.includes("://")) {
    throw new Error(
      "--host must be a hostname or IP address without a scheme or path.",
    );
  }
  const port = integerValue(
    "--port",
    configuredValue(parsed, "--port", env.TAVO_MCP_PORT ?? env.PORT),
    1,
    65_535,
    3_000,
  )!;
  const configuredHosts = configuredList(
    parsed,
    "--allowed-host",
    env.TAVO_MCP_ALLOWED_HOSTS,
  ).map(normalizeAllowedHost);
  const allowedHosts =
    configuredHosts.length > 0
      ? [...new Set(configuredHosts)]
      : LOOPBACK_HOSTS.has(host)
        ? DEFAULT_ALLOWED_HOSTS
        : [];
  if (transport === "http" && allowedHosts.length === 0) {
    throw new Error(
      "HTTP transport on a non-loopback host requires at least one --allowed-host.",
    );
  }
  const allowedOrigins = [
    ...new Set(
      configuredList(
        parsed,
        "--allowed-origin",
        env.TAVO_MCP_ALLOWED_ORIGINS,
      ).map(normalizeAllowedOrigin),
    ),
  ];
  const trustProxyHops = integerValue(
    "--trust-proxy-hops",
    configuredValue(
      parsed,
      "--trust-proxy-hops",
      env.TAVO_MCP_TRUST_PROXY_HOPS,
    ),
    0,
    10,
    0,
  )!;
  const rateLimitPerMinute = integerValue(
    "--rate-limit-per-minute",
    configuredValue(
      parsed,
      "--rate-limit-per-minute",
      env.TAVO_MCP_RATE_LIMIT_PER_MINUTE,
    ),
    1,
    10_000,
    60,
  )!;

  const cliOptions: TavoCliAdapterOptions = {};
  if (timeoutMs !== undefined) cliOptions.timeoutMs = timeoutMs;
  if (maxOutputBytes !== undefined) cliOptions.maxOutputBytes = maxOutputBytes;
  if (maxConcurrency !== undefined) cliOptions.maxConcurrency = maxConcurrency;

  return {
    transport,
    ...(contentPath ? { contentPath } : {}),
    ...(projectPath ? { projectPath } : {}),
    cliOptions,
    http: {
      host,
      port,
      allowedHosts,
      allowedOrigins,
      trustProxyHops,
      rateLimitPerMinute,
    },
  };
}
