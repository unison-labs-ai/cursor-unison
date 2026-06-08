# Contributing to cursor-unison

Thanks for helping improve the Cursor memory plugin for Unison.

## Repo layout

A single TypeScript package built with Bun:

- `src/cli.ts` — the `cursor-unison` CLI
- `src/mcp-server.ts` — the MCP server (16 tools)
- `src/client.ts` — `@unisonlabs/sdk` wrapper
- `src/config.ts` — config loading
- `src/auth.ts` — OTP-based auth + credential storage
- `src/context.ts` — session context formatting
- `src/hooks/` — session-start and session-end hooks
- `rules/`, `skills/`, `commands/` — Cursor plugin assets

## Development

```bash
bun install
bun run build       # compile all dist/ files
bun run lint        # TypeScript type-check
```

To test locally in Cursor:

1. Open this repo in Cursor.
2. Run `bun run build`.
3. Authenticate: `bun run src/cli.ts login --email you@example.com`
4. Restart Cursor after changing `.cursor/mcp.json`.

## Before opening a PR

1. `bun run build` and `bun run lint` must pass (CI runs both).
2. One logical change per PR.
3. Never push directly to `main`.
4. Security issues: see [`SECURITY.md`](./SECURITY.md) — do **not** open a public issue.

## Conventions

- TypeScript + ESM. Strict mode.
- `UNISON_TOKEN` and `usk_` keys must never be committed, logged, or transmitted
  anywhere outside the configured API host.
- Human-readable output → **stderr**; machine data → **stdout**, so piping works.
- The client never enforces auth or permissions — the server is the boundary.
