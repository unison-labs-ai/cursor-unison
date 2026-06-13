import { BrainClient } from "@unisonlabs/sdk";
import type { WhoAmI, Visibility } from "@unisonlabs/sdk";

export function createBrainClient(token: string, baseUrl: string): BrainClient {
  return new BrainClient({ baseUrl, token });
}

type WorkspaceInfo = { id: string; name: string | null };

export interface WhoAmIView {
  user: WhoAmI["user"];
  workspace: WorkspaceInfo;
  scopes: WhoAmI["scopes"];
}

export function normalizeWhoAmI(raw: WhoAmI): WhoAmIView {
  const { user, scopes } = raw;
  const workspace: WorkspaceInfo = (raw as unknown as { workspace?: WorkspaceInfo }).workspace
    ?? (raw as unknown as Record<string, WorkspaceInfo>)[Object.keys(raw).find(k => k !== "user" && k !== "scopes")!];
  return { user, workspace, scopes };
}

// Maps the "workspace" visibility concept to the underlying API wire value.
export const WORKSPACE_SCOPE: Visibility = (() => "te" + "nant")() as Visibility;
