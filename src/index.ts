#!/usr/bin/env node
import { HELP_TEXT, parseServerConfig } from "./config.js";
import { createTavoMcpRuntime } from "./runtime.js";
import { TavoCliAdapter } from "./tavo-cli.js";
import { startHttpTransport } from "./transports/http.js";
import { runStdioTransport } from "./transports/stdio.js";

function waitForShutdownSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const handleSignal = (signal: NodeJS.Signals) => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
      resolve(signal);
    };
    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const config = parseServerConfig(args);
  const runtime = await createTavoMcpRuntime(config.contentPath);

  if (config.transport === "stdio") {
    const cli = config.projectPath
      ? await TavoCliAdapter.create(config.projectPath, config.cliOptions)
      : undefined;
    await runStdioTransport(runtime, cli);
    return;
  }

  const http = await startHttpTransport(runtime, config.http);
  process.stderr.write(
    `${JSON.stringify({ level: "info", event: "http_started", url: http.url })}\n`,
  );
  const signal = await waitForShutdownSignal();
  process.stderr.write(
    `${JSON.stringify({ level: "info", event: "http_stopping", signal })}\n`,
  );
  await http.close();
}

main().catch((error) => {
  process.stderr.write(
    `tavo-mcp: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
