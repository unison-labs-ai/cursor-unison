import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, getApiKey, writeConfig, getProjectConfigPath, GLOBAL_CONFIG_PATH } from "./config.ts";
import { createBrainClient, normalizeWhoAmI, WORKSPACE_SCOPE } from "./client.ts";
import type { Visibility } from "@unisonlabs/sdk";

function getAuth() {
  const config = loadConfig();
  const apiKey = getApiKey(config);
  if (!apiKey) {
    throw new Error(
      "Not authenticated. Run `cursor-unison login --email you@example.com` to connect.",
    );
  }
  return { apiKey, baseUrl: config.baseUrl };
}

export async function startMcpServer() {
  const server = new McpServer({ name: "unison-brain", version: "1.0.0" });

  server.registerTool(
    "unison_get_config",
    {
      description:
        "Show the current Unison Brain configuration — effective settings and config file paths.",
      inputSchema: {},
    },
    async () => {
      const cwd = process.cwd();
      const config = loadConfig(cwd);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                effectiveConfig: {
                  baseUrl: config.baseUrl,
                  maxResults: config.maxResults,
                  maxProjectDocs: config.maxProjectDocs,
                  injectStatus: config.injectStatus,
                  notesPrefix: config.notesPrefix ?? "(auto: /private/notes/)",
                  apiKeySet: !!getApiKey(config),
                },
                configFiles: {
                  project: getProjectConfigPath(cwd),
                  global: GLOBAL_CONFIG_PATH,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "unison_set_config",
    {
      description:
        "Update Unison Brain configuration. scope='project' saves to .cursor/.unison/config.json; scope='global' updates user-wide defaults.",
      inputSchema: {
        scope: z.enum(["project", "global"]).default("project"),
        baseUrl: z.string().url().optional().describe("Override the Unison API base URL"),
        maxResults: z.number().int().positive().optional().describe("Max results returned by brain_search"),
        maxProjectDocs: z.number().int().positive().optional().describe("Max docs injected at session start"),
        injectStatus: z.boolean().optional().describe("Inject brain status summary at session start"),
        notesPrefix: z.string().optional().describe("Default path prefix for brain_write (default: /private/notes/)"),
      },
    },
    async ({ scope, ...updates }) => {
      const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      if (Object.keys(filtered).length === 0) throw new Error("No config values provided.");
      writeConfig(filtered as Parameters<typeof writeConfig>[0], scope);
      const cwd = process.cwd();
      const filePath = scope === "project" ? getProjectConfigPath(cwd) : GLOBAL_CONFIG_PATH;
      return {
        content: [
          {
            type: "text",
            text: `Config updated (${scope}): ${filePath}\n${JSON.stringify(filtered, null, 2)}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "unison_namespaces",
    {
      description:
        "Show the available path namespaces in the Unison brain. Use these as prefixes when writing or listing documents. " +
        '"/private/" is personal-only, "/workspace/" is shared across the team, "/workspace/teams/<slug>/" is scoped to a specific team.',
      inputSchema: {},
    },
    async () => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const who = normalizeWhoAmI(await client.whoami());
      const namespaces: Record<string, { prefix: string; description: string; example: string }> = {
        private: {
          prefix: "/private/",
          description: "Personal documents visible only to you",
          example: "/private/notes/my-note.md",
        },
        workspace: {
          prefix: "/workspace/",
          description: `Documents shared across all members of workspace "${who.workspace.name ?? who.workspace.id}"`,
          example: "/workspace/docs/architecture.md",
        },
      };
      // workspace/teams/<slug>/ namespaces are available if the workspace has sub-teams;
      // those are enumerable via /v1/workspaces/teams (not in current SDK whoami shape).
      return {
        content: [{ type: "text", text: JSON.stringify(namespaces, null, 2) }],
      };
    },
  );

  server.registerTool(
    "unison_status",
    {
      description:
        "Show brain health: document count, entity count, fact count, embedding coverage, pending jobs.",
      inputSchema: {},
    },
    async () => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const status = await client.status();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_whoami",
    {
      description: "Show the authenticated user, workspace, and granted API scopes.",
      inputSchema: {},
    },
    async () => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const who = await client.whoami();
      return { content: [{ type: "text", text: JSON.stringify(who, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_search",
    {
      description:
        "Hybrid keyword + semantic search over the Unison brain. Returns ranked document summaries with highlights.",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(50).default(10).describe("Max results (1-50)"),
        kinds: z
          .array(z.enum(["wiki_page", "raw", "note", "log", "index"]))
          .optional()
          .describe("Filter by document kind"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        memoryType: z
          .enum(["episodic", "semantic", "procedural", "auto"])
          .optional()
          .describe("Filter by memory type"),
      },
    },
    async ({ query, limit, kinds, tags, memoryType }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const results = await client.search(query, { limit, kinds, tags, memoryType });
      const formatted = results.map((r) => ({
        path: r.doc.path,
        title: r.doc.title,
        tldr: r.doc.tldr,
        score: r.score,
        highlight: r.highlight,
        tags: r.doc.tags,
        updatedAt: r.doc.updatedAt,
        sources: r.sources,
      }));
      return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_get",
    {
      description: "Read a document from the brain by path. Returns full body.",
      inputSchema: {
        path: z.string().describe("Document path, e.g. /private/notes/my-note.md"),
      },
    },
    async ({ path }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const doc = await client.get(path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { path: doc.path, title: doc.title, tldr: doc.tldr, tags: doc.tags, body: doc.bodyMd },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "unison_write",
    {
      description:
        "Write (create or overwrite) a document in the brain. Path must end in .md and be under /private/, /workspace/, or /workspace/teams/<slug>/. Bare paths are routed to /private/notes/ automatically.",
      inputSchema: {
        path: z.string().describe("Target path, e.g. /private/notes/my-note.md"),
        body: z.string().describe("Markdown body content"),
        title: z.string().optional(),
        tldr: z.string().optional().describe("One-sentence summary"),
        tags: z.array(z.string()).optional(),
        visibility: z.enum(["private", "workspace"]).optional(),
      },
    },
    async ({ path, body, title, tldr, tags, visibility }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const sdkVisibility = visibility === "workspace" ? WORKSPACE_SCOPE : visibility as Visibility | undefined;
      const doc = await client.write({ path, bodyMd: body, title, tldr, tags, visibility: sdkVisibility });
      return {
        content: [
          {
            type: "text",
            text: `Saved to ${doc.path}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "unison_edit",
    {
      description:
        "Surgically edit a document: replace an exact oldStr with newStr. oldStr must match exactly once in the document body.",
      inputSchema: {
        path: z.string().describe("Document path"),
        oldStr: z.string().describe("Exact string to replace (must match exactly once)"),
        newStr: z.string().describe("Replacement string"),
      },
    },
    async ({ path, oldStr, newStr }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const doc = await client.editDoc({ path, oldStr, newStr });
      return { content: [{ type: "text", text: `Edited ${doc.path}` }] };
    },
  );

  server.registerTool(
    "unison_delete",
    {
      description: "Delete a document from the brain by path.",
      inputSchema: {
        path: z.string().describe("Document path to delete"),
      },
    },
    async ({ path }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const result = await client.delete(path);
      return {
        content: [{ type: "text", text: result.deleted ? `Deleted ${path}` : `Not found: ${path}` }],
      };
    },
  );

  server.registerTool(
    "unison_list",
    {
      description: "List documents in the brain, optionally filtered by path prefix, kind, or tags.",
      inputSchema: {
        prefix: z.string().optional().describe("Path prefix filter, e.g. /private/notes/"),
        kinds: z
          .array(z.enum(["wiki_page", "raw", "note", "log", "index"]))
          .optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(200).default(20),
      },
    },
    async ({ prefix, kinds, tags, limit }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const docs = await client.list({ prefix, kinds, tags, limit });
      const formatted = docs.map((d) => ({
        path: d.path,
        title: d.title,
        tldr: d.tldr,
        kind: d.kind,
        tags: d.tags,
        updatedAt: d.updatedAt,
      }));
      return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_tag",
    {
      description: "Add or remove tags on a brain document.",
      inputSchema: {
        path: z.string(),
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
      },
    },
    async ({ path, add, remove }) => {
      if (!add?.length && !remove?.length) throw new Error("Provide at least one tag to add or remove.");
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const doc = await client.tag(path, { add, remove });
      return {
        content: [{ type: "text", text: `Tags updated. Current tags: ${doc.tags.join(", ") || "(none)"}` }],
      };
    },
  );

  server.registerTool(
    "unison_grep",
    {
      description: "Regex scan across document bodies. Useful for finding exact strings, error messages, or code snippets.",
      inputSchema: {
        pattern: z.string().describe("Regex pattern"),
        caseSensitive: z.boolean().optional().default(false),
        limit: z.number().int().min(1).max(200).optional().default(50),
      },
    },
    async ({ pattern, caseSensitive, limit }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const docs = await client.grep(pattern, { caseSensitive, limit });
      const formatted = docs.map((d) => ({ path: d.path, title: d.title, kind: d.kind }));
      return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_resolve_entity",
    {
      description: "Find an entity in the brain knowledge graph by name (exact then fuzzy + alias matching).",
      inputSchema: {
        name: z.string().describe("Entity display name to resolve"),
        kindHint: z
          .enum(["person", "company", "project", "decision", "topic", "mail_thread", "event", "task", "doc"])
          .optional(),
      },
    },
    async ({ name, kindHint }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const entity = await client.entities.resolve(name, kindHint);
      if (!entity) {
        return { content: [{ type: "text", text: `No entity found for "${name}"` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(entity, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_facts_about",
    {
      description: "Get all known facts about an entity in the brain knowledge graph.",
      inputSchema: {
        entityId: z.string().describe("Entity ID (from unison_resolve_entity)"),
        asOf: z.string().optional().describe("ISO 8601 datetime for point-in-time query"),
        includeInvalidated: z.boolean().optional().default(false),
      },
    },
    async ({ entityId, asOf, includeInvalidated }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const facts = await client.facts.about(entityId, { asOf, includeInvalidated });
      return { content: [{ type: "text", text: JSON.stringify(facts, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_record_fact",
    {
      description: "Record a new fact about an entity in the brain knowledge graph.",
      inputSchema: {
        entityId: z.string().describe("Subject entity ID"),
        predicate: z.string().describe("Relationship/predicate (e.g. 'works_at', 'decided')"),
        factText: z.string().describe("Human-readable fact statement"),
        confidence: z.number().min(0).max(1).optional().default(0.8),
        validFrom: z.string().optional().describe("ISO 8601 validity start"),
        validTo: z.string().optional().describe("ISO 8601 validity end"),
      },
    },
    async ({ entityId, predicate, factText, confidence, validFrom, validTo }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const fact = await client.facts.record({
        subjectId: entityId,
        predicate,
        factText,
        confidence,
        validFrom,
        validTo,
      });
      return { content: [{ type: "text", text: JSON.stringify(fact, null, 2) }] };
    },
  );

  server.registerTool(
    "unison_neighbors",
    {
      description: "Explore graph neighbors (related documents) of a brain document or entity.",
      inputSchema: {
        idOrPath: z.string().describe("Document ID or path"),
        limit: z.number().int().min(1).max(100).optional().default(20),
        kinds: z
          .array(z.enum(["mentions", "derived_from", "supersedes", "see_also"]))
          .optional(),
      },
    },
    async ({ idOrPath, limit, kinds }) => {
      const { apiKey, baseUrl } = getAuth();
      const client = createBrainClient(apiKey, baseUrl);
      const docs = await client.neighbors(idOrPath, { limit, kinds });
      const formatted = docs.map((d) => ({ path: d.path, title: d.title, kind: d.kind }));
      return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  await server.connect(new StdioServerTransport());
}
