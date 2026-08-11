import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { TavoMcpRuntime } from "../runtime.js";
import { createTavoMcpServer } from "../server.js";
import type { TavoCliAdapter } from "../tavo-cli.js";

export async function runStdioTransport(
  runtime: TavoMcpRuntime,
  cli?: TavoCliAdapter,
): Promise<void> {
  const server = createTavoMcpServer({
    ...runtime,
    ...(cli ? { cli } : {}),
  });
  await server.connect(new StdioServerTransport());
}
