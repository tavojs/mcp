# Tavo.js MCP

`@tavojs/mcp` gives AI agents public Tavo.js documentation, exact Framework and UI metadata, and read-only project inspection through the Tavo.js CLI machine protocol.

## Run locally

Requirements: Node.js `^20.19.0 || >=22.12.0`.

```bash
npm install
npm run build
node dist/index.js
```

Add `--project /absolute/path/to/tavo-app` to enable project context, inspection, and verification. The application must have a project-local `@tavojs/cli` package installed; that package exposes the `tavo` binary used for the allowlisted machine commands.

Large projects can tune the bounded CLI runner with `--timeout-ms`, `--max-output-bytes`, and `--max-concurrency`. Defaults are 30 seconds, 1 MiB, and two concurrent commands; accepted limits are shown by `tavo-mcp --help`.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "tavo": {
      "command": "npx",
      "args": ["-y", "@tavojs/mcp", "--project", "/absolute/path/to/app"]
    }
  }
}
```

## Run remotely

Start the documentation-only Streamable HTTP transport explicitly:

```bash
node dist/index.js \
  --transport http \
  --host 0.0.0.0 \
  --allowed-host mcp.tavojs.dev \
  --allowed-host 127.0.0.1 \
  --trust-proxy-hops 1
```

The hosted endpoint is designed for `https://mcp.tavojs.dev/mcp`. HTTP mode never accepts `--project` or exposes project tools. It provides `/healthz` and `/readyz`, validates Host and Origin headers, limits requests, and is designed to run behind an HTTPS reverse proxy. See [Remote MCP deployment](./docs/remote-deployment.md) for Node.js, Docker, Nginx, environment, and security configuration.

## Capabilities

- Search task-oriented Tavo.js documentation.
- Look up public Framework and UI APIs.
- Find Tavo.js UI components, imports, props, examples, and accessibility guidance.
- Read task-bounded project context and inspect routes, components, stores, files, and APIs.
- Run scoped Tavo.js verification.
- Bound every tool response with `maxTokens` (256–8192) and continuation metadata.
- Inspect package, content, and project capability versions through `tavo://status`.

The server cannot generate, change, build, or install project code. It uses stdio by default, offers opt-in stateless HTTP for public documentation, and never fetches documentation at runtime.

Knowledge and project tools default to a 2,048-token response budget. Pass `maxTokens` when a smaller or larger result is useful. Truncated documentation results link back to their full MCP resource.

## Documentation synchronization

The bundled manifest is exported by Tavo.js Website:

```bash
npm --prefix ../tavo-website run docs:export:mcp
npm run sync:content
npm run check:content
npm run schema:check
```

The versioned snapshot is included in this repository, so local development and `check:content` do not require access to the private Website codebase. `sync:content` refreshes it from [`https://tavojs.dev/.well-known/tavo-docs-v1.json`](https://tavojs.dev/.well-known/tavo-docs-v1.json) by default. Set `TAVO_MCP_DOCS_SOURCE` to another local file path or HTTPS URL, or pass `--source=<path-or-url>` for a one-off override. The release workflow separately verifies that the checked-in snapshot matches the public URL before publishing.

## Development

```bash
npm run typecheck
npm test
npm run test:integration
npm run test:search-eval
npm run format:check
```

Runtime modules are organized by responsibility: `src/server.ts` composes the server, `src/capabilities/` registers MCP surfaces, `src/schemas/` contains Zod contracts, `src/transports/` owns stdio and HTTP, and `src/mcp/` contains protocol response adapters. Content loading, search, configuration, and the project-local CLI boundary remain isolated in their own modules.

The published documentation contract is described by [`schemas/tavo-docs-v1.schema.json`](./schemas/tavo-docs-v1.schema.json). CI validates Node.js 20, 22, and 24, package contents, the bundled content hash, search relevance, and production dependencies.

## Contributing, security, and legal

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and contribution requirements. Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

The software and associated documentation are available under the [MIT License](./LICENSE). The Tavo.js names and logo are not licensed under MIT; see [TRADEMARKS.md](./TRADEMARKS.md).
