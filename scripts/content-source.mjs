import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const CONTENT_SOURCE_ENV = "TAVO_MCP_DOCS_SOURCE";
export const PUBLIC_CONTENT_SOURCE =
  "https://tavojs.dev/.well-known/tavo-docs-v1.json";

const MAX_REMOTE_BYTES = 10 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 30_000;

export function resolveContentSource({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  defaultSource = PUBLIC_CONTENT_SOURCE,
} = {}) {
  const sourceArg = argv.find((value) => value.startsWith("--source="));
  const environmentSource = env[CONTENT_SOURCE_ENV]?.trim();
  const configuredSource = sourceArg
    ? sourceArg.slice("--source=".length).trim()
    : environmentSource;

  if (sourceArg && !configuredSource) {
    throw new Error("--source requires a file path or HTTPS URL.");
  }

  const value = configuredSource || defaultSource;
  const explicit = Boolean(sourceArg || environmentSource);
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("The documentation source URL is invalid.");
    }
    if (url.protocol !== "https:") {
      throw new Error("Remote documentation sources must use HTTPS.");
    }
    if (url.username || url.password) {
      throw new Error(
        "Documentation source URLs must not contain credentials.",
      );
    }
    return { kind: "url", value: url, explicit };
  }

  return { kind: "file", value: resolve(cwd, value), explicit };
}

export async function readContentSource(source, { fetchImpl = fetch } = {}) {
  if (source.kind === "file") {
    return readFile(source.value, "utf8");
  }

  let response;
  try {
    response = await fetchImpl(source.value, {
      headers: { accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error("Unable to fetch the remote documentation manifest.", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(
      `Unable to fetch the remote documentation manifest (HTTP ${response.status}).`,
    );
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_BYTES) {
    throw new Error("The remote documentation manifest is too large.");
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_REMOTE_BYTES) {
    throw new Error("The remote documentation manifest is too large.");
  }
  return new TextDecoder().decode(bytes);
}
