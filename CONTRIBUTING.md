# Contributing to @tavojs/mcp

Thank you for contributing to the read-only Tavo.js MCP server. Keep changes focused, preserve unrelated work, and use Conventional Commits such as `feat: add component discovery`.

## Development workflow

Install dependencies and build the package:

```bash
npm install
npm run build
```

Use `npm run dev -- --project /path/to/app` to start the TypeScript stdio server with local project inspection. Use `npm run dev -- --transport http --host 127.0.0.1` to start the documentation-only HTTP server.

Before submitting a change, run the checks appropriate to its scope:

```bash
npm run typecheck
npm test
npm run test:integration
npm run check:content
npm run schema:check
npm run test:search-eval
npm run format:check
```

`npm run validate` runs the complete validation sequence. Integration tests use a real MCP client against the compiled server. Project-aware tests must use temporary fixtures and fake local CLIs; they must not modify real applications or require network access.

The public documentation snapshot is `src/content/tavo-docs-v1.json` and is included in this repository. Local development and validation do not require the private Website checkout. `npm run sync:content` refreshes the snapshot from `https://tavojs.dev/.well-known/tavo-docs-v1.json` by default, and `npm run check:content:remote` verifies that a release matches that public copy.

Website maintainers can set `TAVO_MCP_DOCS_SOURCE` to the private export path and run `npm run sync:content` as part of the deployment handoff. Other HTTPS URLs are also supported. A `--source=<path-or-url>` argument takes precedence over the environment variable.

## MCP and security boundaries

Contributions must preserve these boundaries:

- Standard output is reserved for MCP protocol output. Do not write logs or diagnostics to stdout.
- Local project tools are read-only and allowlist only `agent-context`, `inspect`, and `verify` through the project-local Tavo.js CLI.
- The HTTP transport remains documentation-only. It must not expose project context, inspection, or verification.
- Remote Host and Origin validation must remain in place, and request bodies must not appear in errors or logs.
- Internal repositories, roadmaps, credentials, and other non-public Tavo.js content must never be ingested, bundled, or exposed.
- Do not add change, generation, build, installation, or arbitrary-execution capabilities.

Tests should cover successful requests, malformed input, missing content, CLI failures, path traversal, and transport behavior when relevant. Pull requests should describe MCP surface changes, list the validation commands run, and identify any manifest-schema or security-boundary changes.

## License and copyright

- Contributions are licensed under the MIT License.
- Contributors retain copyright in their own work; no copyright assignment is required.
- Contributors must have the legal right to submit all code, documentation, tests, schemas, evaluation data, and other material they contribute.
- Do not submit confidential content, secrets, personal data, incompatible copied material, or internal-only Tavo.js content.
- The MIT License grants no trademark rights. [TRADEMARKS.md](./TRADEMARKS.md) applies.

## Developer Certificate of Origin

Every contributed commit must be signed off under [Developer Certificate of Origin 1.1](https://developercertificate.org/). Create signed-off commits with:

```bash
git commit --signoff
```

The commit message will include a line like:

```text
Signed-off-by: Your Name <your.email@example.com>
```

The sign-off certifies that you have the right to submit the contribution under the project's license. Unsigned commits may need correction before merge.
