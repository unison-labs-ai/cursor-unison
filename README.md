# cursor-unison

Persistent AI memory for Cursor — powered by [Unison](https://unisonlabs.ai).

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
| `unison_whoami` | Show authenticated user, tenant, and scopes |
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
  "notesPrefix": "/tenant/eng/"
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
| `/tenant/...` | Visible to your whole team |
| `/teams/<slug>/...` | Visible to a specific team |

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
