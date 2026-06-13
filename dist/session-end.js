// src/auth.ts
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
var CREDENTIALS_DIR = path.join(os.homedir(), ".config", "unison");
var CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "config.json");
function loadCredentials() {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE))
      return null;
    const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    if (data.apiKey && data.apiKey.startsWith("usk_"))
      return data;
    return null;
  } catch {
    return null;
  }
}

// src/config.ts
import path2 from "node:path";
import os2 from "node:os";
import fs2 from "node:fs";
var GLOBAL_CONFIG_PATH = path2.join(os2.homedir(), ".config", "cursor", "unison.json");
var DEFAULTS = {
  baseUrl: "https://brain.unisonlabs.ai",
  maxResults: 10,
  maxProjectDocs: 5,
  injectStatus: false,
  notesPrefix: null
};
function readJson(filePath) {
  try {
    if (!fs2.existsSync(filePath))
      return null;
    return JSON.parse(fs2.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function findProjectConfig(cwd) {
  let dir = cwd;
  while (true) {
    const configPath = path2.join(dir, ".cursor", ".unison", "config.json");
    const data = readJson(configPath);
    if (data)
      return data;
    const parent = path2.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
function loadConfig(cwd) {
  const projectConfig = findProjectConfig(cwd ?? process.cwd());
  const globalConfig = readJson(GLOBAL_CONFIG_PATH);
  const merged = { ...DEFAULTS, ...globalConfig, ...projectConfig };
  return {
    apiKey: process.env.UNISON_TOKEN ?? merged.apiKey ?? null,
    baseUrl: process.env.UNISON_API_URL ?? merged.baseUrl ?? DEFAULTS.baseUrl,
    maxResults: merged.maxResults ?? DEFAULTS.maxResults,
    maxProjectDocs: merged.maxProjectDocs ?? DEFAULTS.maxProjectDocs,
    injectStatus: merged.injectStatus ?? DEFAULTS.injectStatus,
    notesPrefix: merged.notesPrefix ?? null
  };
}
function getApiKey(config) {
  if (config.apiKey)
    return config.apiKey;
  const creds = loadCredentials();
  return creds?.apiKey ?? null;
}

// node_modules/@unisonlabs/sdk/dist/index.js
function createAgentApi(ctx) {
  const f = ctx.fetchImpl ?? fetch;
  return {
    async run(opts) {
      if (!ctx.token) {
        throw new Error("Not authenticated. Run `unison auth login` first.");
      }
      const url = `${ctx.baseUrl.replace(/\/+$/, "")}/v1/agent`;
      const res = await f(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctx.token}`,
          accept: "text/event-stream"
        },
        body: JSON.stringify({
          message: opts.message,
          ...opts.model !== undefined ? { model: opts.model } : {},
          ...opts.sessionId !== undefined ? { sessionId: opts.sessionId } : {}
        }),
        signal: opts.signal
      });
      if (!res.ok || !res.body) {
        let message = res.statusText || `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body.error?.message)
            message = body.error.message;
        } catch {}
        throw new Error(message);
      }
      return parseAgentSse(res.body, opts.onEvent);
    }
  };
}
async function parseAgentSse(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder;
  let buffer = "";
  let answer = "";
  let sessionId = "";
  let finishReason = "stop";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const sep = findEventBoundary(buffer);
        if (sep === -1)
          break;
        const rawEvent = buffer.slice(0, sep.start);
        buffer = buffer.slice(sep.end);
        const data = extractData(rawEvent);
        if (data === null)
          continue;
        if (data === "[DONE]")
          return { sessionId, answer, finishReason };
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        if (event.type === "text" && typeof event.delta === "string")
          answer += event.delta;
        if (event.type === "done") {
          if (event.sessionId)
            sessionId = event.sessionId;
          if (event.finishReason)
            finishReason = event.finishReason;
        }
        onEvent?.(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { sessionId, answer, finishReason };
}
function findEventBoundary(buffer) {
  const lf = buffer.indexOf(`

`);
  const crlf = buffer.indexOf(`\r
\r
`);
  if (lf < 0 && crlf < 0)
    return -1;
  if (lf < 0)
    return { start: crlf, end: crlf + 4 };
  if (crlf < 0)
    return { start: lf, end: lf + 2 };
  return lf < crlf ? { start: lf, end: lf + 2 } : { start: crlf, end: crlf + 4 };
}
function extractData(block) {
  const lines = block.split(/\r?\n/);
  const parts = [];
  for (const line of lines) {
    if (line.startsWith("data: "))
      parts.push(line.slice(6));
    else if (line.startsWith("data:"))
      parts.push(line.slice(5));
  }
  return parts.length === 0 ? null : parts.join(`
`);
}

class BrainError extends Error {
  code;
  status;
  constructor(code, message, status) {
    super(message);
    this.name = "BrainError";
    this.code = code;
    this.status = status;
  }
}
var API_VERSION = "v1";
function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}
function qs(params) {
  const sp = new URLSearchParams;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined)
      continue;
    if (Array.isArray(value)) {
      for (const item of value)
        sp.append(key, item);
    } else {
      sp.set(key, String(value));
    }
  }
  return sp.toString();
}
async function parseResponse(res) {
  if (res.ok) {
    return await res.json();
  }
  let code = "http_error";
  let message = res.statusText || `Request failed with status ${res.status}`;
  try {
    const data = await res.json();
    if (data.error?.code)
      code = data.error.code;
    if (data.error?.message)
      message = data.error.message;
  } catch {}
  throw new BrainError(code, message, res.status);
}
function createCalendarApi(req) {
  return {
    connection: () => req("GET", "/calendar/connection"),
    calendars: () => req("GET", "/calendar/calendars").then((d) => d.calendars),
    events: (o) => req("GET", `/calendar/events?${qs({ from: o.from, to: o.to, calendarId: o.calendarIds })}`).then((d) => d.events),
    event: (id) => req("GET", `/calendar/events/${encodeURIComponent(id)}`),
    createEvent: (input) => req("POST", "/calendar/events", input)
  };
}
function createChatApi(req) {
  return {
    channels: () => req("GET", "/chat/channels").then((d) => d.channels),
    channel: (id) => req("GET", `/chat/channels/${encodeURIComponent(id)}`),
    messages: (channelId, o = {}) => req("GET", `/chat/messages?${qs({ channelId, limit: o.limit, cursor: o.cursor })}`),
    send: (input) => req("POST", "/chat/messages", input),
    search: (query, o = {}) => req("GET", `/chat/search?${qs({ query, channelId: o.channelId, limit: o.limit })}`),
    threadReplies: (threadRootId, o = {}) => req("GET", `/chat/threads/replies?${qs({ threadRootId, limit: o.limit, cursor: o.cursor })}`),
    openDm: (otherUserId) => req("POST", "/chat/dms", { otherUserId }),
    members: (q) => req("GET", q ? `/chat/members?${qs({ q })}` : "/chat/members").then((d) => d.members)
  };
}
function agentSessionId() {
  const g = globalThis;
  try {
    return g.Deno?.env?.get?.("UNISON_SESSION_ID");
  } catch {
    return;
  }
}
function createMailApi(req) {
  return {
    connection: () => req("GET", "/mail/connection"),
    folders: () => req("GET", "/mail/folders"),
    threads: (o = {}) => req("GET", `/mail/threads?${qs({ ...o })}`),
    thread: (id, o = {}) => req("GET", `/mail/threads/${encodeURIComponent(id)}?${qs({ allowImages: o.allowImages })}`),
    send: (input) => req("POST", "/mail/send", input),
    draft: (input) => req("POST", "/mail/agent-drafts", {
      ...input,
      sessionId: input.sessionId ?? agentSessionId()
    })
  };
}
function createPeopleApi(req) {
  const search = (query, o = {}) => req("GET", `/people/search?${qs({ q: query, objectSlug: o.objectSlug, limit: o.limit })}`);
  return {
    search,
    list: (o = {}) => search("", o)
  };
}
function createResearchApi(req) {
  return {
    search: async (query) => {
      const data = await req("GET", `/research/search?${qs({ q: query })}`);
      return data.results;
    }
  };
}
function byteLength(data) {
  if (typeof Blob !== "undefined" && data instanceof Blob)
    return data.size;
  if (data instanceof Uint8Array)
    return data.byteLength;
  return data.byteLength;
}
function createWorkApi(req, rawFetch) {
  const assets = {
    uploadUrl: (input) => req("POST", "/work/assets/upload-url", input),
    create: (input) => req("POST", "/work/assets", input),
    readUrl: (id, o = {}) => req("GET", `/work/assets/${encodeURIComponent(id)}/read-url?${qs({ expiresIn: o.expiresIn })}`),
    upload: async (input) => {
      const sizeBytes = input.sizeBytes ?? byteLength(input.data);
      const prep = await req("POST", "/work/assets/upload-url", {
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes,
        displayName: input.displayName,
        metadata: input.metadata
      });
      if (!prep.signedUrl) {
        throw new BrainError("asset_upload_unavailable", "The server did not return a signed upload URL; asset storage may be unconfigured.", 502);
      }
      const put = await rawFetch(prep.signedUrl, {
        method: "PUT",
        headers: { "content-type": input.mimeType },
        body: input.data
      });
      if (!put.ok) {
        throw new BrainError("asset_upload_failed", `Asset upload failed with status ${put.status}.`, put.status);
      }
      return req("POST", "/work/assets", {
        assetId: prep.assetId,
        storageBucket: prep.storageBucket,
        storagePath: prep.storagePath,
        originalFilename: input.filename,
        displayName: input.displayName ?? null,
        mimeType: input.mimeType,
        sizeBytes,
        sha256: input.sha256 ?? null,
        uploadToken: prep.token ?? undefined,
        metadata: input.metadata
      });
    }
  };
  return {
    apply: (input) => req("POST", input.dryRun ? "/work/apply:dry-run" : "/work/apply", input),
    applyDryRun: (input) => req("POST", "/work/apply:dry-run", { ...input, dryRun: true }),
    query: (input) => req("POST", "/work/query", {
      viewId: input.viewId,
      ...input.query ? { query: input.query } : {}
    }),
    records: (input) => req("GET", `/work/records?${qs({
      tableId: input.tableId,
      semanticKind: input.semanticKind,
      limit: input.limit
    })}`),
    search: (input) => req("POST", "/work/search", input),
    inspect: (input) => req("POST", "/work/inspect", input),
    tree: (o = {}) => req("GET", `/work/tree?${qs({ teamSpaceId: o.teamSpaceId })}`),
    folder: (id) => req("GET", `/work/folders/${encodeURIComponent(id)}`),
    artifact: (id) => req("GET", `/work/artifacts/${encodeURIComponent(id)}`),
    tableSchema: (id) => req("GET", `/work/tables/${encodeURIComponent(id)}/schema`),
    viewQuery: (id, query) => req("POST", `/work/views/${encodeURIComponent(id)}/query`, query ?? {}),
    assets
  };
}
var WRITABLE_BRAIN_ROOTS = ["private", "teams", "tenant"];

class BrainContractError extends BrainError {
  constructor(message) {
    super("fs_contract", message, 422);
    this.name = "BrainContractError";
  }
}
function slugify(input) {
  const slug = input.toLowerCase().replace(/\.md$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "note";
}
function defaultPrivateNotePath(rawPath) {
  const base = rawPath.split("/").filter(Boolean).pop() ?? rawPath;
  return `/private/notes/${slugify(base)}.md`;
}
function routeBrainWritePath(path3) {
  const trimmed = path3.trim();
  if (!trimmed) {
    throw new BrainContractError("A write path is required.");
  }
  if (!trimmed.startsWith("/")) {
    return defaultPrivateNotePath(trimmed);
  }
  const segments = trimmed.split("/").filter(Boolean);
  const root = segments[0];
  if (root && WRITABLE_BRAIN_ROOTS.includes(root)) {
    return `/${segments.join("/")}`;
  }
  if (segments.length === 1 && segments[0]?.endsWith(".md")) {
    return defaultPrivateNotePath(segments[0]);
  }
  throw new BrainContractError(`Path "${trimmed}" is not in the brain FS contract. Writable roots are /private/… (e.g. /private/notes/<slug>.md), /tenant/… (e.g. /tenant/people/<slug>.md), and /teams/<slug>/… (e.g. /teams/<slug>/docs/<id>.md). Bare names route to /private/notes/.`);
}

class BrainClient {
  entities;
  facts;
  links;
  review;
  jobs;
  work;
  mail;
  chat;
  calendar;
  people;
  research;
  agent;
  baseUrl;
  token;
  fetchImpl;
  constructor(opts) {
    this.baseUrl = stripTrailingSlash(opts.baseUrl);
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
    this.entities = {
      list: (o = {}) => this.req("GET", `/brain/entities?${qs({ kind: o.kinds, status: o.status, limit: o.limit })}`).then((d) => d.entities),
      resolve: (name, kindHint) => this.req("GET", `/brain/entities/resolve?${qs({ name, kindHint })}`).then((d) => d.entity),
      get: (id) => this.req("GET", `/brain/entities/${encodeURIComponent(id)}`),
      upsert: (input) => this.req("POST", "/brain/entities", input)
    };
    this.facts = {
      list: (o = {}) => this.req("GET", `/brain/facts?${qs({ limit: o.limit, includeInvalidated: o.includeInvalidated })}`).then((d) => d.facts),
      about: (entityId, o = {}) => this.req("GET", `/brain/entities/${encodeURIComponent(entityId)}/facts?${qs({ asOf: o.asOf, includeInvalidated: o.includeInvalidated })}`).then((d) => d.facts),
      timeline: (entityId, o = {}) => this.req("GET", `/brain/entities/${encodeURIComponent(entityId)}/timeline?${qs({ from: o.from, to: o.to })}`).then((d) => d.facts),
      record: (input) => this.req("POST", "/brain/facts", input),
      correct: (factId, input) => this.req("PATCH", `/brain/facts/${encodeURIComponent(factId)}`, input),
      invalidate: (factId) => this.req("DELETE", `/brain/facts/${encodeURIComponent(factId)}`)
    };
    this.links = {
      list: (limit) => this.req("GET", `/brain/links?${qs({ limit })}`).then((d) => d.links),
      create: (fromId, toId, kind) => this.req("POST", "/brain/links", { fromId, toId, kind })
    };
    this.review = {
      conflicts: () => this.req("GET", "/brain/review/conflicts").then((d) => d.conflicts),
      resolve: (conflictId, verdict) => this.req("POST", `/brain/review/conflicts/${encodeURIComponent(conflictId)}`, { verdict }),
      merges: (limit) => this.req("GET", `/brain/review/merges?${qs({ limit })}`).then((d) => d.merges),
      undo: (mergeEventId) => this.req("POST", `/brain/review/merges/${encodeURIComponent(mergeEventId)}/undo`)
    };
    this.jobs = {
      list: (o = {}) => this.req("GET", `/brain/jobs?${qs({ status: o.status, kind: o.kind, limit: o.limit })}`).then((d) => d.jobs),
      stats: () => this.req("GET", "/brain/jobs/stats"),
      retry: (jobId) => this.req("POST", `/brain/jobs/${encodeURIComponent(jobId)}/retry`)
    };
    const request = (method, path3, body) => this.req(method, path3, body);
    this.work = createWorkApi(request, this.fetchImpl);
    this.mail = createMailApi(request);
    this.chat = createChatApi(request);
    this.calendar = createCalendarApi(request);
    this.people = createPeopleApi(request);
    this.research = createResearchApi(request);
    this.agent = createAgentApi({
      baseUrl: this.baseUrl,
      token: this.token,
      fetchImpl: this.fetchImpl
    });
  }
  async search(query, opts = {}) {
    const data = await this.req("GET", `/brain/search?${qs({ q: query, k: opts.limit, kind: opts.kinds, tag: opts.tags, memoryType: opts.memoryType, asOf: opts.asOf })}`);
    return data.results;
  }
  async grep(pattern, opts = {}) {
    const data = await this.req("GET", `/brain/grep?${qs({ pattern, caseSensitive: opts.caseSensitive, limit: opts.limit })}`);
    return data.results;
  }
  get(path3) {
    return this.req("GET", `/brain/doc?${qs({ path: path3 })}`);
  }
  async list(opts = {}) {
    const data = await this.req("GET", `/brain/list?${qs({ prefix: opts.prefix, kind: opts.kinds, tag: opts.tags, limit: opts.limit })}`);
    return data.documents;
  }
  async listFs(path3 = "") {
    const data = await this.req("GET", `/brain/fs?${qs({ path: path3 })}`);
    return data.entries;
  }
  getRaw(path3) {
    return this.req("GET", `/brain/fs/read?${qs({ path: path3 })}`);
  }
  async write(input) {
    const path3 = routeBrainWritePath(input.path);
    return this.req("PUT", "/brain/doc", { ...input, path: path3 });
  }
  async editDoc(input) {
    if (input.oldStr === input.newStr) {
      throw new BrainError("edit_noop", "oldStr and newStr are identical — nothing to change.", 422);
    }
    return this.req("PATCH", "/brain/doc", input);
  }
  delete(path3) {
    return this.req("DELETE", `/brain/doc?${qs({ path: path3 })}`);
  }
  tag(path3, input) {
    return this.req("POST", "/brain/doc/tag", { path: path3, ...input });
  }
  share(kind, id) {
    return this.req("POST", "/brain/share", { kind, id });
  }
  async neighbors(idOrPath, opts = {}) {
    const data = await this.req("GET", `/brain/neighbors?${qs({ idOrPath, kind: opts.kinds, limit: opts.limit })}`);
    return data.documents;
  }
  status() {
    return this.req("GET", "/brain/status");
  }
  whoami() {
    return this.req("GET", "/auth/whoami");
  }
  async req(method, path3, body) {
    const headers = { accept: "application/json" };
    if (this.token)
      headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined)
      headers["content-type"] = "application/json";
    const res = await this.fetchImpl(`${this.baseUrl}/${API_VERSION}${path3}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return parseResponse(res);
  }
}

// src/client.ts
function createBrainClient(token, baseUrl) {
  return new BrainClient({ baseUrl, token });
}
var WORKSPACE_SCOPE = (() => "te" + "nant")();

// src/hooks/session-end.ts
function extractTurnText(turn) {
  if (typeof turn.content === "string")
    return turn.content;
  const message = turn.message;
  const blocks = message?.content;
  if (Array.isArray(blocks)) {
    return blocks.filter((b) => !!b && typeof b === "object" && b.type === "text" && typeof b.text === "string").map((b) => b.text).join(`
`);
  }
  return "";
}
function parseTranscript(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed))
      return parsed;
  } catch {}
  return text.split(`
`).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}
function sessionNotePath(sessionId, workspaceRoot) {
  const wsName = workspaceRoot.split("/").filter(Boolean).pop() ?? "workspace";
  const shortId = sessionId.replace(/[^a-z0-9-]/gi, "-").slice(0, 12);
  return `/private/notes/cursor-session-${wsName}-${shortId}.md`;
}
var NON_PERSISTABLE_REASONS = new Set(["aborted", "error"]);
async function main() {
  const raw = await Bun.stdin.text();
  const input = JSON.parse(raw);
  if (!input.transcript_path || NON_PERSISTABLE_REASONS.has(input.reason ?? ""))
    return;
  const creds = loadCredentials();
  if (!creds)
    return;
  const workspaceRoot = input.workspace_roots?.[0] ?? process.cwd();
  const config = loadConfig(workspaceRoot);
  const apiKey = getApiKey(config);
  if (!apiKey)
    return;
  const fileContent = await Bun.file(input.transcript_path).text();
  const turns = parseTranscript(fileContent);
  const relevant = turns.filter((t) => t.role === "user" || t.role === "assistant").map((t) => ({ role: t.role, text: extractTurnText(t) })).filter((t) => t.text.length > 0);
  const userTurns = relevant.filter((t) => t.role === "user");
  if (userTurns.length < 2)
    return;
  let transcript = relevant.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join(`
`);
  if (transcript.length > 1e5) {
    transcript = transcript.slice(0, 1e5);
  }
  const client = createBrainClient(apiKey, config.baseUrl);
  const notePath = sessionNotePath(input.session_id, workspaceRoot);
  const date = new Date().toISOString().split("T")[0];
  const wsName = workspaceRoot.split("/").filter(Boolean).pop() ?? "workspace";
  const bodyMd = `# Cursor session — ${wsName} (${date})

${transcript}`;
  await client.write({
    path: routeBrainWritePath(notePath),
    bodyMd,
    title: `Cursor session — ${wsName} (${date})`,
    tldr: `IDE session transcript for project ${wsName}`,
    tags: ["cursor-session", wsName],
    kind: "log"
  });
}
main().catch((err) => {
  console.error("[unison] session-end error:", err);
});
