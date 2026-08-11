# Remote MCP Deployment

Tavo.js MCP can serve its public documentation capabilities through stateless Streamable HTTP. The remote endpoint never exposes project context, inspection, or verification tools and does not need Tavo.js Website source code at runtime.

## Run with Node

The stdio transport remains the default. Start HTTP explicitly:

```bash
npm run build
node dist/index.js \
  --transport http \
  --host 0.0.0.0 \
  --port 3000 \
  --allowed-host mcp.tavojs.dev \
  --allowed-host 127.0.0.1 \
  --trust-proxy-hops 1
```

After deployment, the MCP URL will be `https://mcp.tavojs.dev/mcp`. `GET /healthz` reports process liveness and `GET /readyz` reports whether the server is accepting work.

## Run the container

```bash
docker build -t tavo-mcp .
docker run --rm \
  --read-only \
  --tmpfs /tmp \
  -p 3000:3000 \
  -e TAVO_MCP_ALLOWED_HOSTS=mcp.tavojs.dev,127.0.0.1,localhost \
  -e TAVO_MCP_TRUST_PROXY_HOPS=1 \
  tavo-mcp
```

The image runs as the unprivileged `node` user. It contains compiled MCP code, production dependencies, the public schema, and the bundled documentation snapshot. It does not contain the Website checkout or credentials.

## Reverse proxy

Terminate HTTPS and enforce a deployment-wide rate limit at the proxy. This Nginx example assumes exactly one trusted proxy hop:

```nginx
limit_req_zone $binary_remote_addr zone=tavo_mcp:10m rate=60r/m;

server {
    listen 443 ssl;
    server_name mcp.tavojs.dev;

    location = /mcp {
        limit_req zone=tavo_mcp burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 35s;
    }

    location ~ ^/(healthz|readyz)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host 127.0.0.1;
    }
}
```

Set `TAVO_MCP_TRUST_PROXY_HOPS` to the exact number of trusted proxy hops. Leaving it at `0` ignores forwarded client addresses. Setting too many hops can let clients spoof their rate-limit identity.

## Configuration

CLI arguments take precedence over environment variables.

| Environment variable             | Default          | Purpose                                                                |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `TAVO_MCP_TRANSPORT`             | `stdio`          | Select `stdio` or `http`                                               |
| `TAVO_MCP_HOST`                  | `127.0.0.1`      | HTTP bind address                                                      |
| `TAVO_MCP_PORT`                  | `3000`           | HTTP port; falls back to `PORT`                                        |
| `TAVO_MCP_ALLOWED_HOSTS`         | Loopback hosts   | Comma-separated Host allowlist                                         |
| `TAVO_MCP_ALLOWED_ORIGINS`       | Empty            | Exact comma-separated origins allowed when an Origin header is present |
| `TAVO_MCP_TRUST_PROXY_HOPS`      | `0`              | Number of trusted reverse-proxy hops                                   |
| `TAVO_MCP_RATE_LIMIT_PER_MINUTE` | `60`             | Per-process, per-client MCP request limit                              |
| `TAVO_MCP_CONTENT`               | Bundled snapshot | Optional validated manifest path                                       |

Binding to a non-loopback interface without an explicit Host allowlist fails at startup. Requests without an Origin header are accepted; requests with Origin are rejected unless it exactly matches the configured allowlist. Browser CORS is intentionally not enabled.

## Client configuration

Point a Streamable HTTP-compatible MCP client at:

```text
https://mcp.tavojs.dev/mcp
```

The first public release has no application-level authentication because it exposes only already-public documentation. HTTPS, Host and Origin validation, application rate limiting, and an equal or stricter proxy limit are required. Add OAuth or bearer-token middleware before using the endpoint for private information.

The service is stateless and can run multiple replicas without sticky sessions. Apply global rate limits at the reverse proxy because the built-in limiter is local to each process.
