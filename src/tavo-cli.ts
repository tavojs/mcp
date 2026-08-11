import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONCURRENCY = 2;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const MAX_CONCURRENCY = 4;
const MAX_ERROR_LENGTH = 2_048;

export type InspectKind = "route" | "component" | "store" | "file" | "api";

export type TavoCliAdapterOptions = {
  timeoutMs?: number | undefined;
  maxOutputBytes?: number | undefined;
  maxConcurrency?: number | undefined;
};

export type InstalledTavoPackages = {
  "@tavojs/cli": string | null;
  "@tavojs/core": string | null;
  "@tavojs/ui": string | null;
};

type ResolvedTavoCliAdapterOptions = {
  timeoutMs: number;
  maxOutputBytes: number;
  maxConcurrency: number;
};

type ProtocolEnvelope = {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  project: { fingerprint: string };
  data: unknown;
  diagnostics: unknown[];
  nextActions: Array<{ command: string; reason: string }>;
  metrics: { durationMs: number; bytes: number; estimatedTokens: number };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseProtocolEnvelope(
  stdout: string,
  expectedCommand: string,
): ProtocolEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Tavo.js CLI returned malformed JSON.");
  }

  if (!isObject(value)) {
    throw new Error("Tavo.js CLI returned an invalid protocol v1 envelope.");
  }
  const project = value.project;
  const metrics = value.metrics;
  const nextActions = value.nextActions;
  const valid =
    value.schemaVersion === 1 &&
    value.command === expectedCommand &&
    typeof value.ok === "boolean" &&
    isObject(project) &&
    typeof project.fingerprint === "string" &&
    /^[a-f0-9]{16}$/.test(project.fingerprint) &&
    Array.isArray(value.diagnostics) &&
    Array.isArray(nextActions) &&
    nextActions.every(
      (item) =>
        isObject(item) &&
        typeof item.command === "string" &&
        typeof item.reason === "string",
    ) &&
    isObject(metrics) &&
    isNonNegativeNumber(metrics.durationMs) &&
    Number.isInteger(metrics.bytes) &&
    isNonNegativeNumber(metrics.bytes) &&
    Number.isInteger(metrics.estimatedTokens) &&
    isNonNegativeNumber(metrics.estimatedTokens) &&
    Object.hasOwn(value, "data");

  if (!valid) {
    throw new Error(
      `Tavo.js CLI returned an invalid protocol v1 envelope for '${expectedCommand}'.`,
    );
  }
  return value as ProtocolEnvelope;
}

function sanitizeError(value: string | undefined): string {
  if (!value) return "The command did not provide an error message.";
  const sanitized = value
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ")
    .replace(
      /\b((?:token|password|secret|authorization|api[-_]?key)\s*[:=]\s*)\S+/gi,
      "$1[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized.length <= MAX_ERROR_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_ERROR_LENGTH)}…`;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function boundedInteger(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

export class TavoCliAdapter {
  readonly projectRoot: string;
  readonly cliPath: string;
  readonly installedPackages: InstalledTavoPackages;

  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly maxConcurrency: number;
  private activeCommands = 0;
  private readonly waiters: Array<() => void> = [];

  private constructor(
    projectRoot: string,
    cliPath: string,
    installedPackages: InstalledTavoPackages,
    options: ResolvedTavoCliAdapterOptions,
  ) {
    this.projectRoot = projectRoot;
    this.cliPath = cliPath;
    this.installedPackages = installedPackages;
    this.timeoutMs = options.timeoutMs;
    this.maxOutputBytes = options.maxOutputBytes;
    this.maxConcurrency = options.maxConcurrency;
  }

  static async create(
    projectRoot: string,
    options: TavoCliAdapterOptions = {},
  ): Promise<TavoCliAdapter> {
    const timeoutMs = boundedInteger(
      "timeoutMs",
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );
    const maxOutputBytes = boundedInteger(
      "maxOutputBytes",
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      1_024,
      DEFAULT_MAX_OUTPUT_BYTES,
    );
    const maxConcurrency = boundedInteger(
      "maxConcurrency",
      options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      1,
      MAX_CONCURRENCY,
    );
    const root = await realpath(path.resolve(projectRoot));
    if (!(await stat(root)).isDirectory()) {
      throw new Error(
        "The configured Tavo.js project root is not a directory.",
      );
    }

    const packagePath = path.join(root, "node_modules", "@tavojs", "cli");
    const packageRoot = await realpath(packagePath).catch(() => "");
    const candidate = path.join(packagePath, "dist", "tavo.mjs");
    const cliPath = await realpath(candidate).catch(() => "");
    if (!packageRoot || !cliPath || !(await stat(cliPath)).isFile()) {
      throw new Error(
        "No project-local Tavo.js CLI was found. Install '@tavojs/cli' in the configured project.",
      );
    }
    if (!isWithin(packageRoot, cliPath)) {
      throw new Error(
        "The project-local Tavo.js executable escapes its package directory.",
      );
    }
    let packageManifest: unknown;
    try {
      packageManifest = JSON.parse(
        await readFile(path.join(packageRoot, "package.json"), "utf8"),
      );
    } catch {
      throw new Error(
        "The project-local @tavojs/cli package has an invalid package manifest.",
      );
    }
    if (!isObject(packageManifest) || packageManifest.name !== "@tavojs/cli") {
      throw new Error(
        "The resolved executable does not belong to the '@tavojs/cli' package.",
      );
    }
    const packageVersion =
      typeof packageManifest.version === "string"
        ? packageManifest.version
        : null;
    const readPackageVersion = async (
      packageName: "@tavojs/core" | "@tavojs/ui",
    ): Promise<string | null> => {
      const manifestPath = path.join(
        root,
        "node_modules",
        ...packageName.split("/"),
        "package.json",
      );
      try {
        const manifest: unknown = JSON.parse(
          await readFile(manifestPath, "utf8"),
        );
        return isObject(manifest) &&
          manifest.name === packageName &&
          typeof manifest.version === "string"
          ? manifest.version
          : null;
      } catch {
        return null;
      }
    };
    const installedPackages: InstalledTavoPackages = {
      "@tavojs/cli": packageVersion,
      "@tavojs/core": await readPackageVersion("@tavojs/core"),
      "@tavojs/ui": await readPackageVersion("@tavojs/ui"),
    };
    return new TavoCliAdapter(root, cliPath, installedPackages, {
      timeoutMs,
      maxOutputBytes,
      maxConcurrency,
    });
  }

  async getContext(input: {
    task?: string | undefined;
    target?: string | undefined;
    detail?: "summary" | "full" | undefined;
  }): Promise<unknown> {
    const args = ["agent-context", "--json"];
    if (input.task) args.push("--task", input.task);
    if (input.target) args.push("--target", input.target);
    if (input.detail) args.push("--detail", input.detail);
    return this.run(args, "agent-context");
  }

  async inspect(kind: InspectKind, target: string): Promise<unknown> {
    if (kind === "file")
      await this.assertProjectPath(target, "File inspection");
    return this.run(["inspect", kind, target, "--json"], "inspect");
  }

  async verify(input: {
    files?: string[] | undefined;
    smoke?: boolean | undefined;
  }): Promise<unknown> {
    for (const file of input.files ?? []) {
      await this.assertProjectPath(file, "Verification file");
    }
    const args = ["verify", "--no-project-scripts", "--json"];
    if (input.files?.length) args.push("--files", input.files.join(","));
    if (input.smoke) args.push("--smoke");
    return this.run(args, "verify");
  }

  private async assertProjectPath(
    target: string,
    label: string,
  ): Promise<void> {
    if (
      !target ||
      path.isAbsolute(target) ||
      path.win32.isAbsolute(target) ||
      target.split(/[\\/]+/).includes("..")
    ) {
      throw new Error(
        `${label} targets must be project-relative and cannot contain '..'.`,
      );
    }
    const resolved = path.resolve(this.projectRoot, target);
    if (!isWithin(this.projectRoot, resolved)) {
      throw new Error(`${label} target escapes the configured project root.`);
    }

    let existing = resolved;
    while (existing !== this.projectRoot) {
      const canonical = await realpath(existing).catch(() => "");
      if (canonical) {
        if (!isWithin(this.projectRoot, canonical)) {
          throw new Error(
            `${label} target escapes the configured project root.`,
          );
        }
        return;
      }
      existing = path.dirname(existing);
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeCommands < this.maxConcurrency) {
      this.activeCommands += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeCommands += 1;
  }

  private release(): void {
    this.activeCommands -= 1;
    this.waiters.shift()?.();
  }

  private async run(args: string[], expectedCommand: string): Promise<unknown> {
    await this.acquire();
    try {
      try {
        const result = await execFileAsync(
          process.execPath,
          [this.cliPath, ...args],
          {
            cwd: this.projectRoot,
            encoding: "utf8",
            timeout: this.timeoutMs,
            maxBuffer: this.maxOutputBytes,
            env: {
              PATH: process.env.PATH,
              NODE_ENV: process.env.NODE_ENV ?? "development",
              NO_COLOR: "1",
            },
          },
        );
        return parseProtocolEnvelope(result.stdout, expectedCommand);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith("Tavo.js CLI returned malformed JSON") ||
            error.message.startsWith(
              "Tavo.js CLI returned an invalid protocol",
            ))
        ) {
          throw error;
        }
        const failure = error as Error & {
          stdout?: string;
          stderr?: string;
          code?: unknown;
          killed?: boolean;
        };
        if (failure.stdout) {
          try {
            return parseProtocolEnvelope(failure.stdout, expectedCommand);
          } catch {
            // Report the execution failure, not attacker-controlled stdout.
          }
        }
        if (failure.killed) {
          throw new Error(
            `Tavo.js CLI command timed out after ${this.timeoutMs}ms.`,
          );
        }
        throw new Error(
          `Tavo.js CLI command failed${failure.code ? ` (${String(failure.code)})` : ""}: ${sanitizeError(failure.stderr)}`,
        );
      }
    } finally {
      this.release();
    }
  }
}
