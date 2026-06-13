<div align="center">

<img src="https://raw.githubusercontent.com/unison-labs-ai/unison-brain/main/assets/brain.svg" width="140" />

# cursor-unison

**Cursor forgets everything the moment the tab closes. Give it a memory.**

Persistent AI memory for Cursor — powered by the [Unison brain](https://unisonlabs.ai).

[![CI](https://github.com/unison-labs-ai/cursor-unison/actions/workflows/ci.yml/badge.svg)](https://github.com/unison-labs-ai/cursor-unison/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/unison-labs-ai/cursor-unison?style=social)](https://github.com/unison-labs-ai/cursor-unison)

[**Why**](#with-unison-vs-without) • [**Install**](#install) • [**MCP Tools**](#mcp-tools) • [**Configuration**](#configuration) • [**Document paths**](#document-paths) • [**Development**](#development)

</div>

---

### With Unison vs. without

| Without Unison | With Unison |
|---|---|
| You re-explain your stack every new Cursor session | Brain documents are injected at session start — Cursor already knows |
| Architecture decisions live only in your head or a stale `.cursorrules` | Decisions are written to the brain by the agent; retrieved next session automatically |
| Switch machines or repos → blank slate | One brain, every machine, every project — context travels with you |
| `@codebase` search finds code; it forgets what you decided and why | `unison_search` finds decisions, people, patterns — the *why*, not just the code |
| Teammate onboards and re-asks every question you've already answered | `/workspace/...` docs are visible to your whole workspace, not just you |

---

## Install

Install from the [Cursor Marketplace](https://cursor.com/marketplace), then authenticate:

```bash
bunx cursor-unison@latest login --email you@example.com
```

You'll receive a verification code by email. Enter it when prompted. Your `usk_` API key is stored at `~/.config/unison/config.json` (mode 0600).

## What it does

- **Session hooks** — injects relevant brain documents at session start; saves conversation transcripts at session end
- **MCP tools** — available in every Cursor AI session for explicit memory control
- **Always-on rule** — reminds the AI to use brain tools proactively

## MCP Tools

| Tool | Description |
|---|---|
| `unison_search` | Hybrid keyword + semantic search over the brain |
| `unison_write` | Create or overwrite a document in the brain |
| `unison_get` | Read a document by path |
| `unison_edit` | Surgically replace exact text in a document |
| `unison_delete` | Delete a document |
| `unison_list` | List documents, with optional prefix/kind/tag filters |
| `unison_tag` | Add or remove tags on a document |
| `unison_grep` | Regex scan across document bodies |
| `unison_resolve_entity` | Find a person/project/concept in the knowledge graph |
| `unison_facts_about` | Get all known facts about an entity |
| `unison_record_fact` | Record a new fact about an entity |
| `unison_neighbors` | Explore related documents via graph edges |
| `unison_status` | Brain health: doc/entity/fact counts, pending jobs |
| `unison_whoami` | Show authenticated user, workspace, and scopes |
| `unison_get_config` | Show current configuration and config file paths |
| `unison_set_config` | Update configuration at project or global scope |

## Configuration

### Environment variables

| Variable | Description |
|---|---|
| `UNISON_TOKEN` | API key (`usk_live_...`) — overrides all other sources |
| `UNISON_API_URL` | Override the API base URL (default: `https://brain.unisonlabs.ai`) |

### Global config — `~/.config/cursor/unison.json`

User-wide defaults, applies to all projects.

```json
{
  "baseUrl": "https://brain.unisonlabs.ai",
  "maxResults": 10,
  "maxProjectDocs": 5,
  "injectStatus": false,
  "notesPrefix": null
}
```

### Project config — `.cursor/.unison/config.json`

Per-workspace overrides. Add `.cursor/.unison/` to `.gitignore` if it contains an API key. Project config wins over global config.

```json
{
  "maxResults": 15,
  "maxProjectDocs": 8,
  "notesPrefix": "/workspace/eng/"
}
```

| Option | Description | Default |
|---|---|---|
| `baseUrl` | Unison API base URL | `https://brain.unisonlabs.ai` |
| `maxResults` | Max results from `unison_search` | `10` |
| `maxProjectDocs` | Max notes injected at session start | `5` |
| `injectStatus` | Inject brain status at session start | `false` |
| `notesPrefix` | Default path prefix for new notes | `/private/notes/` |

You can update these via the AI using `unison_set_config`.

## Document paths

Documents live in the Unison brain filesystem. All paths must end in `.md`.

| Root | Visibility |
|---|---|
| `/private/...` | Private to you |
| `/workspace/...` | Visible to your whole workspace |
| `/system/...` | Read-only system documents |

Bare paths (e.g. `my-note.md`) are routed to `/private/notes/` automatically.

## Key recovery

If you lose your API key:

```bash
bunx cursor-unison@latest login --email you@example.com --recover
```

A recovery code is emailed to the address. A fresh `usk_` key is minted after verification.

## Using the MCP server in other tools

```json
{
  "mcpServers": {
    "unison-brain": {
      "command": "npx",
      "args": ["-y", "@unisonlabs/mcp"],
      "env": {
        "UNISON_TOKEN": "usk_live_...",
        "UNISON_API_URL": "https://brain.unisonlabs.ai"
      }
    }
  }
}
```

## Development

```bash
bun install
bun run build   # compiles all dist/ files
```

### Testing locally (without the marketplace)

1. **Open this repo in Cursor** — rules, commands, skills, and hooks are picked up from `.cursor-plugin`.
2. **Build:** `bun run build`
3. **Use the local MCP server** — `.cursor/mcp.json` in this repo points to `dist/` automatically.
4. **Log in:** `bun run src/cli.ts login --email you@example.com`
5. **Restart Cursor** after changing `.cursor/mcp.json`.

To test in a different project, add the `unison-brain` entry from `.mcp.json` to that project's MCP config with `dist/mcp-server.js` resolved to an absolute path.

## Star history

If this saves you from re-explaining your codebase one more time, leave a ⭐ — it helps others find it.

[![Star History Chart](https://api.star-history.com/svg?repos=unison-labs-ai/cursor-unison&type=Date)](https://star-history.com/#unison-labs-ai/cursor-unison&Date)

---

## Part of the Unison Labs constellation

**One brain, every agent.** Every repo below reads from _and writes to_ the same [Unison brain](https://unisonlabs.ai) — no per-tool memory silos.

| Repo | What it does |
|---|---|
| [unison-brain](https://github.com/unison-labs-ai/unison-brain) | CLI · SDK · MCP server — the core |
| [claude-unison](https://github.com/unison-labs-ai/claude-unison) | Memory for Claude Code |
| **[cursor-unison](https://github.com/unison-labs-ai/cursor-unison)** | **Memory for Cursor ← you are here** |
| [codex-unison](https://github.com/unison-labs-ai/codex-unison) | Memory for OpenAI Codex CLI |
| [opencode-unison](https://github.com/unison-labs-ai/opencode-unison) | Memory for OpenCode |
| [openclaw-unison](https://github.com/unison-labs-ai/openclaw-unison) | Memory for OpenClaw |
| [pipecat-unison](https://github.com/unison-labs-ai/pipecat-unison) | Memory for Pipecat voice agents |
| [python-sdk](https://github.com/unison-labs-ai/python-sdk) | Python SDK for the brain |
| [install-mcp](https://github.com/unison-labs-ai/install-mcp) | One-command MCP installer |
| [code-chunk](https://github.com/unison-labs-ai/code-chunk) | AST-aware code chunking |
| [unison-fs](https://github.com/unison-labs-ai/unison-fs) | Mount the brain as a filesystem |
| [backchannel](https://github.com/unison-labs-ai/backchannel) | Async messaging between agents |
| [Unison-evals](https://github.com/unison-labs-ai/Unison-evals) | Open memory benchmark suite |
