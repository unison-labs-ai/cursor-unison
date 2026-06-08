import { loadCredentials } from "../auth.ts";
import { loadConfig, getApiKey } from "../config.ts";
import { createBrainClient } from "../client.ts";
import { formatContext } from "../context.ts";

interface SessionStartInput {
  workspace_roots: string[];
  user_email?: string;
  session_id: string;
}

const ok = () => process.stdout.write(JSON.stringify({ continue: true }));

async function main() {
  const raw = await Bun.stdin.text();
  const input: SessionStartInput = JSON.parse(raw);

  const creds = loadCredentials();
  if (!creds) return ok();

  const config = loadConfig(input.workspace_roots[0]);
  const apiKey = getApiKey(config);
  if (!apiKey) return ok();

  const client = createBrainClient(apiKey, config.baseUrl);

  // Fetch recent project-scoped notes and relevant search results in parallel.
  // Recent notes: list from /private/notes/ (ordered by recency).
  // Search: search for workspace context using the project root name as a hint.
  const workspaceHint = input.workspace_roots[0]
    ? input.workspace_roots[0].split("/").filter(Boolean).pop() ?? ""
    : "";

  const [recentResult, searchResult] = await Promise.allSettled([
    client.list({ prefix: "/private/notes/", limit: config.maxProjectDocs }),
    workspaceHint
      ? client.search(workspaceHint, { limit: config.maxResults })
      : Promise.resolve([]),
  ]);

  const recentDocs = recentResult.status === "fulfilled" ? recentResult.value : [];
  const searchResults = searchResult.status === "fulfilled" ? searchResult.value : [];

  const context = formatContext(recentDocs, searchResults);
  if (!context) return ok();

  process.stdout.write(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "sessionStart",
        additionalContext: context,
      },
    }),
  );
}

main().catch((err) => {
  console.error("[unison] session-start error:", err);
  ok();
});
