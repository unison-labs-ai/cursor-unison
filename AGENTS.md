# AGENTS.md

Guidance for AI agents. Jump to the section that applies to you:

- **Use this plugin** — you are an agent helping a user add Unison brain memory to Cursor → [Install and configure](#install-and-configure)
- **Contribute to this repo** — you are changing this plugin's code → [Working in this repo](#working-in-this-repo)

Follows the [AGENTS.md](https://agents.md/) convention. Human contributors: see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Install and configure

cursor-unison adds persistent, searchable memory to every Cursor AI session.
At session start the plugin injects relevant brain documents as context. At
session end it saves the conversation transcript. Between those bookends, 16
MCP tools let the AI read, write, search, and navigate the knowledge graph
explicitly.

### 1. Install

From the Cursor Marketplace: search for **cursor-unison** and install.

For local development or testing:

```bash
git clone https://github.com/unison-labs-ai/cursor-unison
cd cursor-unison
bun install && bun run build
```

Then point `.cursor/mcp.json` at the built `dist/mcp-server.js`.

### 2. Authenticate

Ask the user to run:

```bash
bunx cursor-unison@latest login --email you@example.com
```

An OTP is sent to the email address. After verification a `usk_` key is saved
to `~/.config/unison/config.json` (mode `0600`).

**CI / headless:** set `UNISON_TOKEN=usk_live_...` in the environment. It
overrides the stored key. Never write the key to any file that is committed.

### 3. Verify

```bash
bunx cursor-unison@latest status
```

Expected output: tenant name, scopes, and doc/entity/fact counts.

### 4. MCP wiring

The plugin registers itself as an MCP server in Cursor. For use in other
tools, add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "unison-brain": {
      "command": "bunx",
      "args": ["cursor-unison@latest", "mcp"],
      "env": {
        "UNISON_TOKEN": "usk_live_...",
        "UNISON_API_URL": "https://api.unisonlabs.ai"
      }
    }
  }
}
```

Available MCP tools: `unison_search`, `unison_write`, `unison_get`,
`unison_edit`, `unison_delete`, `unison_list`, `unison_tag`, `unison_grep`,
`unison_resolve_entity`, `unison_facts_about`, `unison_record_fact`,
`unison_neighbors`, `unison_status`, `unison_whoami`, `unison_get_config`,
`unison_set_config`.

### The session loop

At session start the hook injects relevant notes from `/private/notes/` and a
workspace-scoped search. At session end it saves the transcript to
`/private/notes/cursor-session-<workspace>-<id>.md`.

Between those events the AI should:

1. **Search before answering.** If the user asks about something that might
   have prior context, call `unison_search` first.
2. **Write decisions and facts.** When the user states something worth
   keeping, call `unison_write` or `unison_record_fact`.
3. **Resolve names.** Before asking who someone is, call
   `unison_resolve_entity`.

---

## Working in this repo

A single-package TypeScript plugin for Cursor, built with Bun. Source lives
under `src/`:

- `src/cli.ts` — the `cursor-unison` CLI entry point
- `src/mcp-server.ts` — the MCP server (16 tools)
- `src/client.ts` — thin wrapper around `@unisonlabs/sdk`
- `src/config.ts` — config loading (env vars + global + project JSON)
- `src/auth.ts` — OTP-based auth flow + credential storage
- `src/context.ts` — session context formatting
- `src/hooks/session-start.ts` — session-start hook
- `src/hooks/session-end.ts` — session-end hook

### Build, lint, test

```bash
bun install
bun run build     # compile all dist/ files
bun run lint      # TypeScript type-check
```

CI runs `bun install && bun run build`. Both must pass on pull_request to main.

### Conventions

- TypeScript + ESM. Strict mode.
- Credentials are stored at `~/.config/unison/config.json` with mode `0600`.
  Never log, commit, or transmit a `usk_` key.
- Human-readable output goes to **stderr**; machine data goes to **stdout**.
- The client enforces nothing — the Unison backend is the security boundary.

### PRs

One logical change per PR. Never push directly to `main`. Security issues:
see [`SECURITY.md`](./SECURITY.md).
