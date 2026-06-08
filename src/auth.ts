import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const CREDENTIALS_DIR = path.join(os.homedir(), ".config", "unison");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "config.json");

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><style>
  body { background: #0a0a0a; color: #fff; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; flex-direction: column; gap: 1rem; }
  h1 { font-size: 2rem; margin: 0; }
  p { color: #888; margin: 0; }
</style></head><body><h1>Connected to Cursor!</h1><p>You can close this tab.</p></body></html>`;

export interface StoredCredentials {
  apiKey: string;
  createdAt: string;
}

export function loadCredentials(): StoredCredentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    if (data.apiKey && data.apiKey.startsWith("usk_")) return data;
    return null;
  } catch {
    return null;
  }
}

export function saveCredentials(apiKey: string): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  const data: StoredCredentials = { apiKey, createdAt: new Date().toISOString() };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function clearCredentials(): boolean {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Machine-auth flow: provision a usk_ key via POST /v1/auth/provision,
 * then prompt the user to enter the OTP emailed to them, and verify
 * via POST /v1/auth/verify. Saves the key on success.
 *
 * For users with an existing verified account, --recover triggers the
 * request-key flow instead.
 */
export async function startAuthFlow(opts: {
  email: string;
  baseUrl: string;
  recover?: boolean;
}): Promise<{ success: boolean; apiKey?: string; error?: string }> {
  const base = opts.baseUrl.replace(/\/$/, "");

  if (opts.recover) {
    // Key recovery for existing verified accounts
    const reqRes = await fetch(`${base}/v1/auth/request-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: opts.email }),
    });
    if (!reqRes.ok) {
      const err = await reqRes.json().catch(() => ({ error: { message: reqRes.statusText } }));
      return { success: false, error: (err as any)?.error?.message ?? "Request failed" };
    }
    process.stderr.write(`\nRecovery OTP sent to ${opts.email}. Check your inbox.\n`);
  } else {
    // New account provisioning
    const provRes = await fetch(`${base}/v1/auth/provision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: opts.email }),
    });

    if (!provRes.ok) {
      const err = await provRes.json().catch(() => ({ error: { message: provRes.statusText } }));
      const code = (err as any)?.error?.code;
      if (code === "email_registered") {
        // Already registered — fall back to recovery flow
        const reqRes = await fetch(`${base}/v1/auth/request-key`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: opts.email }),
        });
        if (!reqRes.ok) {
          return { success: false, error: "Account exists but recovery request failed" };
        }
        process.stderr.write(
          `\nAccount already exists. Recovery OTP sent to ${opts.email}. Check your inbox.\n`,
        );
      } else {
        return { success: false, error: (err as any)?.error?.message ?? "Provision failed" };
      }
    } else {
      process.stderr.write(
        `\nVerification email sent to ${opts.email}. Check your inbox.\n`,
      );
    }
  }

  // Prompt for OTP (read from stdin)
  process.stderr.write("Enter the verification code: ");
  const code = await readLine();

  const verifyRes = await fetch(`${base}/v1/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: opts.email, code: code.trim() }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({ error: { message: verifyRes.statusText } }));
    return { success: false, error: (err as any)?.error?.message ?? "Verification failed" };
  }

  const data = await verifyRes.json() as { verified: boolean; apiKey?: string; tenantId?: string };
  if (!data.verified) {
    return { success: false, error: "Verification returned verified=false" };
  }

  // apiKey is returned on recovery; for first-time provision it was in the
  // provision response — but since we may have gone the recovery route, the
  // verify endpoint always returns it on verified accounts.
  const apiKey = data.apiKey;
  if (!apiKey) {
    return {
      success: false,
      error: "Verification succeeded but no API key returned. Try `cursor-unison login --recover`.",
    };
  }

  saveCredentials(apiKey);
  return { success: true, apiKey };
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.on("data", (chunk) => {
      buf += chunk;
      if (buf.includes("\n")) {
        process.stdin.pause();
        resolve(buf.split("\n")[0]);
      }
    });
  });
}
