import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { loadCredentials } from "./auth.ts";

export const GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".config", "cursor", "unison.json");

export function getProjectConfigPath(cwd: string): string {
  return path.join(cwd, ".cursor", ".unison", "config.json");
}

export function writeConfig(
  updates: Partial<Omit<Config, "apiKey">>,
  scope: "project" | "global",
  cwd = process.cwd(),
): void {
  const filePath = scope === "project" ? getProjectConfigPath(cwd) : GLOBAL_CONFIG_PATH;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = readJson(filePath) ?? {};
  fs.writeFileSync(filePath, JSON.stringify({ ...existing, ...updates }, null, 2));
}

export interface Config {
  apiKey: string | null;
  baseUrl: string;
  maxResults: number;
  maxProjectDocs: number;
  injectStatus: boolean;
  notesPrefix: string | null;
}

const DEFAULTS: Omit<Config, "apiKey"> = {
  baseUrl: "https://brain.unisonlabs.ai",
  maxResults: 10,
  maxProjectDocs: 5,
  injectStatus: false,
  notesPrefix: null,
};

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function findProjectConfig(cwd: string): Record<string, unknown> | null {
  let dir = cwd;
  while (true) {
    const configPath = path.join(dir, ".cursor", ".unison", "config.json");
    const data = readJson(configPath);
    if (data) return data;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(cwd?: string): Config {
  const projectConfig = findProjectConfig(cwd ?? process.cwd());
  const globalConfig = readJson(GLOBAL_CONFIG_PATH);

  const merged: Record<string, unknown> = { ...DEFAULTS, ...globalConfig, ...projectConfig };

  return {
    apiKey: (process.env.UNISON_TOKEN ?? (merged.apiKey as string | undefined) ?? null),
    baseUrl:
      process.env.UNISON_API_URL ??
      (merged.baseUrl as string | undefined) ??
      DEFAULTS.baseUrl,
    maxResults: (merged.maxResults as number) ?? DEFAULTS.maxResults,
    maxProjectDocs: (merged.maxProjectDocs as number) ?? DEFAULTS.maxProjectDocs,
    injectStatus: (merged.injectStatus as boolean) ?? DEFAULTS.injectStatus,
    notesPrefix: (merged.notesPrefix as string | null) ?? null,
  };
}

export function getApiKey(config: Config): string | null {
  if (config.apiKey) return config.apiKey;
  const creds = loadCredentials();
  return creds?.apiKey ?? null;
}
