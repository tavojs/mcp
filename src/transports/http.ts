import { randomUUID } from "node:crypto";
import { createServer, type Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import type { HttpConfig } from "../config.js";
import type { TavoMcpRuntime } from "../runtime.js";
import { createTavoMcpServer } from "../server.js";
import { packageVersion } from "../version.js";

const BODY_LIMIT_BYTES = 100 * 1_024;
const REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_GRACE_MS = 10_000;

type ReadinessState = { ready: boolean };
type CloseHandler = () => Promise<void>;

export type HttpRequestLog = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export type HttpTransportOptions = HttpConfig & {
  requestTimeoutMs?: number | undefined;
  shutdownGraceMs?: number | undefined;
  logger?: ((entry: HttpRequestLog) => void) | undefined;
  serverFactory?: ((runtime: TavoMcpRuntime) => McpServer) | undefined;
};

export type RunningHttpTransport = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

function jsonRpcError(
  response: Response,
  status: number,
  code: number,
  message: string,
): void {
  response.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function requestLogger(
  logger: (entry: HttpRequestLog) => void,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader("X-Request-Id", requestId);
    response.once("finish", () => {
      const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
      logger({
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Number(elapsedNanoseconds) / 1_000_000,
      });
    });
    next();
  };
}

function hostValidation(
  allowedHosts: string[],
): (request: Request, response: Response, next: NextFunction) => void {
  const allowed = new Set(allowedHosts);
  return (request, response, next) => {
    const header = request.headers.host;
    if (!header) {
      jsonRpcError(response, 403, -32_000, "Missing Host header.");
      return;
    }
    try {
      const hostname = new URL(`http://${header}`).hostname;
      if (!allowed.has(hostname)) {
        jsonRpcError(response, 403, -32_000, "Host is not allowed.");
        return;
      }
    } catch {
      jsonRpcError(response, 403, -32_000, "Invalid Host header.");
      return;
    }
    next();
  };
}

function originValidation(
  allowedOrigins: string[],
): (request: Request, response: Response, next: NextFunction) => void {
  const allowed = new Set(allowedOrigins);
  return (request, response, next) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !allowed.has(origin)) {
      jsonRpcError(response, 403, -32_000, "Origin is not allowed.");
      return;
    }
    next();
  };
}

function defaultLogger(entry: HttpRequestLog): void {
  process.stderr.write(
    `${JSON.stringify({ level: "info", event: "http_request", ...entry })}\n`,
  );
}

function errorType(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("type" in error)) {
    return undefined;
  }
  return typeof error.type === "string" ? error.type : undefined;
}

function createApplication(
  runtime: TavoMcpRuntime,
  options: HttpTransportOptions,
  readiness: ReadinessState,
  activeConnections: Set<CloseHandler>,
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxyHops);
  app.use(requestLogger(options.logger ?? defaultLogger));
  app.use(hostValidation(options.allowedHosts));
  app.use(originValidation(options.allowedOrigins));
  app.use("/mcp", (request, response, next) => {
    if (
      request.method === "POST" &&
      !request.is(["application/json", "application/*+json"])
    ) {
      jsonRpcError(
        response,
        415,
        -32_000,
        "Content-Type must be application/json.",
      );
      return;
    }
    next();
  });
  app.use(
    "/mcp",
    rateLimit({
      windowMs: 60_000,
      limit: options.rateLimitPerMinute,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_request, response) => {
        jsonRpcError(
          response,
          429,
          -32_000,
          "Rate limit exceeded. Retry later.",
        );
      },
    }),
  );
  app.use(
    express.json({
      limit: BODY_LIMIT_BYTES,
      strict: true,
      type: ["application/json", "application/*+json"],
    }),
  );

  app.get("/healthz", (_request, response) => {
    response.json({
      status: "ok",
      service: "@tavojs/mcp",
      version: packageVersion,
    });
  });

  app.get("/readyz", (_request, response) => {
    response.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ready" : "shutting-down",
      contentHash: runtime.store.manifest.contentHash,
    });
  });

  app.post("/mcp", async (request, response) => {
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    let server: McpServer | undefined;
    let closePromise: Promise<void> | undefined;
    const close = () => {
      closePromise ??= server
        ? server.close().catch(() => undefined)
        : Promise.resolve();
      return closePromise;
    };
    activeConnections.add(close);
    response.once("close", () => {
      void close().finally(() => activeConnections.delete(close));
    });

    try {
      server = (options.serverFactory ?? createTavoMcpServer)(runtime);
      // SDK 1.x transport callbacks predate exactOptionalPropertyTypes.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) {
        jsonRpcError(response, 500, -32_603, "Internal server error.");
      } else if (!response.writableEnded) {
        response.end();
      }
    } finally {
      await close();
      activeConnections.delete(close);
    }
  });

  const methodNotAllowed = (_request: Request, response: Response) => {
    response.setHeader("Allow", "POST");
    jsonRpcError(response, 405, -32_000, "Method not allowed.");
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.use((_request, response) => {
    jsonRpcError(response, 404, -32_001, "Not found.");
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (response.headersSent) {
      if (!response.writableEnded) response.end();
      return;
    }
    const type = errorType(error);
    if (type === "entity.too.large") {
      jsonRpcError(response, 413, -32_000, "Request body is too large.");
      return;
    }
    if (type === "entity.parse.failed" || error instanceof SyntaxError) {
      jsonRpcError(response, 400, -32_700, "Malformed JSON request body.");
      return;
    }
    jsonRpcError(response, 500, -32_603, "Internal server error.");
  };
  app.use(errorHandler);

  return app;
}

function closeListener(server: NodeHttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

function timeout(milliseconds: number): Promise<"timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), milliseconds);
    timer.unref();
  });
}

export async function startHttpTransport(
  runtime: TavoMcpRuntime,
  options: HttpTransportOptions,
): Promise<RunningHttpTransport> {
  const readiness: ReadinessState = { ready: true };
  const activeConnections = new Set<CloseHandler>();
  const app = createApplication(runtime, options, readiness, activeConnections);
  const httpServer = createServer(app);
  httpServer.requestTimeout = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = 10_000;
  httpServer.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(options.port, options.host);
  });

  const address = httpServer.address() as AddressInfo;
  const displayHost = ["0.0.0.0", "::"].includes(options.host)
    ? "127.0.0.1"
    : options.host.includes(":")
      ? `[${options.host}]`
      : options.host;
  let shutdown: Promise<void> | undefined;

  const close = () => {
    shutdown ??= (async () => {
      readiness.ready = false;
      const listenerClosed = closeListener(httpServer);
      const outcome = await Promise.race([
        listenerClosed.then(() => "closed" as const),
        timeout(options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS),
      ]);
      if (outcome === "timeout") {
        await Promise.allSettled(
          [...activeConnections].map((closeConnection) => closeConnection()),
        );
        httpServer.closeAllConnections();
        await listenerClosed;
      }
    })();
    return shutdown;
  };

  return {
    url: `http://${displayHost}:${address.port}/mcp`,
    port: address.port,
    close,
  };
}
