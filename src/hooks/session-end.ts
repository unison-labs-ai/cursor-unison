import { loadCredentials } from "../auth.ts";
import { loadConfig, getApiKey } from "../config.ts";
import { createBrainClient } from "../client.ts";
import { routeBrainWritePath } from "@unisonlabs/sdk";

interface SessionEndInput {
  session_id: string;
  transcript_path?: string;
  reason?: string;
  workspace_roots?: string[];
}

interface Turn {
  role: string;
  content?: unknown;
  message?: unknown;
}

function extractTurnText(turn: Turn): string {
  if (typeof turn.content === "string") return turn.content;

  const message = turn.message as { content?: unknown } | undefined;
  const blocks = message?.content;
  if (Array.isArray(blocks)) {
    return blocks
      .filter(
        (b): b is { type: string; text: string } =>
          !!b &&
          typeof b === "object" &&
          (b as { type?: unknown }).type === "text" &&
          typeof (b as { text?: unknown }).text === "string",
      )
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

function parseTranscript(text: string): Turn[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Try JSONL
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Derive a deterministic note path from the session ID and workspace name.
 * Written to /private/notes/cursor-session-<slug>.md so it appears in the
 * user's private brain alongside other notes.
 */
function sessionNotePath(sessionId: string, workspaceRoot: string): string {
  const wsName = workspaceRoot.split("/").filter(Boolean).pop() ?? "workspace";
  // Use the first 8 chars of session id for brevity
  const shortId = sessionId.replace(/[^a-z0-9-]/gi, "-").slice(0, 12);
  return `/private/notes/cursor-session-${wsName}-${shortId}.md`;
}

const NON_PERSISTABLE_REASONS = new Set(["aborted", "error"]);

async function main() {
  const raw = await Bun.stdin.text();
  const input: SessionEndInput = JSON.parse(raw);

  if (!input.transcript_path || NON_PERSISTABLE_REASONS.has(input.reason ?? "")) return;

  const creds = loadCredentials();
  if (!creds) return;

  const workspaceRoot = input.workspace_roots?.[0] ?? process.cwd();
  const config = loadConfig(workspaceRoot);
  const apiKey = getApiKey(config);
  if (!apiKey) return;

  const fileContent = await Bun.file(input.transcript_path).text();
  const turns = parseTranscript(fileContent);

  const relevant = turns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({ role: t.role, text: extractTurnText(t) }))
    .filter((t) => t.text.length > 0);

  const userTurns = relevant.filter((t) => t.role === "user");
  if (userTurns.length < 2) return;

  let transcript = relevant
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n");
  if (transcript.length > 100_000) {
    transcript = transcript.slice(0, 100_000);
  }

  const client = createBrainClient(apiKey, config.baseUrl);
  const notePath = sessionNotePath(input.session_id, workspaceRoot);
  const date = new Date().toISOString().split("T")[0];
  const wsName = workspaceRoot.split("/").filter(Boolean).pop() ?? "workspace";

  const bodyMd = `# Cursor session — ${wsName} (${date})\n\n${transcript}`;

  await client.write({
    path: routeBrainWritePath(notePath),
    bodyMd,
    title: `Cursor session — ${wsName} (${date})`,
    tldr: `IDE session transcript for project ${wsName}`,
    tags: ["cursor-session", wsName],
    kind: "log",
  });
}

main().catch((err) => {
  console.error("[unison] session-end error:", err);
});
