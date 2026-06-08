import type { BrainDocument, SearchResult } from "@unisonlabs/sdk";

const MAX_LENGTH = 2000;

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = diff / 60_000;
  const hours = diff / 3_600_000;
  const days = diff / 86_400_000;
  const weeks = diff / 604_800_000;

  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  if (days < 7) return `${Math.floor(days)}d ago`;
  return `${Math.floor(weeks)}w ago`;
}

export function formatContext(
  recentDocs: BrainDocument[],
  searchResults: SearchResult[],
): string {
  const hasRecent = recentDocs.length > 0;
  const hasSearch = searchResults.length > 0;

  if (!hasRecent && !hasSearch) return "";

  const sections: string[] = ["[UNISON BRAIN CONTEXT]"];

  if (hasSearch) {
    sections.push(
      "\nRelevant Knowledge:",
      ...searchResults.map((r) => {
        const body = r.doc.tldr ?? r.doc.title ?? r.doc.path;
        const highlight = r.highlight ? ` — ${r.highlight}` : "";
        return `- ${body}${highlight}`;
      }),
    );
  }

  if (hasRecent) {
    sections.push(
      "\nRecent Notes:",
      ...recentDocs.map((d) => {
        const time = d.updatedAt ? `[${formatRelativeTime(d.updatedAt)}] ` : "";
        const body = d.tldr ?? d.title ?? d.path;
        return `- ${time}${body}`;
      }),
    );
  }

  sections.push("\nUse these memories when relevant. Don't force them into every response.");

  let result = sections.join("\n");
  if (result.length > MAX_LENGTH) {
    result = result.slice(0, MAX_LENGTH - 3) + "...";
  }
  return result;
}
