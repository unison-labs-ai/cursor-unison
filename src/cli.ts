import { startMcpServer } from "./mcp-server.ts";
import { loadCredentials, startAuthFlow, clearCredentials } from "./auth.ts";
import { loadConfig, getApiKey } from "./config.ts";
import { createBrainClient } from "./client.ts";

const command = process.argv[2];

switch (command) {
  case "mcp":
    await startMcpServer();
    break;

  case "login": {
    const emailArg = process.argv.indexOf("--email");
    const email = emailArg !== -1 ? process.argv[emailArg + 1] : undefined;
    const recover = process.argv.includes("--recover");

    if (!email) {
      console.error("Usage: cursor-unison login --email you@example.com [--recover]");
      process.exit(1);
    }

    const config = loadConfig();
    const existing = loadCredentials();
    if (existing && !recover) {
      console.log("Already authenticated. Use `cursor-unison logout` first, or add --recover to rotate the key.");
      process.exit(0);
    }

    const result = await startAuthFlow({ email, baseUrl: config.baseUrl, recover });
    if (result.success) {
      console.log("Authenticated successfully.");
      console.log(`API key: ${result.apiKey!.slice(0, 10)}...`);
    } else {
      console.error(`Authentication failed: ${result.error}`);
      process.exit(1);
    }
    break;
  }

  case "logout": {
    const removed = clearCredentials();
    console.log(removed ? "Logged out." : "No credentials found.");
    break;
  }

  case "status": {
    const config = loadConfig();
    const apiKey = getApiKey(config);
    if (!apiKey) {
      console.log("Not authenticated. Run `cursor-unison login --email you@example.com` or set UNISON_TOKEN.");
      break;
    }
    const creds = loadCredentials();
    if (creds) {
      console.log(`Authenticated since ${creds.createdAt}`);
    }
    console.log(`API key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`);
    try {
      const client = createBrainClient(apiKey, config.baseUrl);
      const who = await client.whoami();
      console.log(`Tenant: ${who.tenant.name ?? who.tenant.id}`);
      console.log(`Scopes: ${who.scopes.join(", ")}`);
      const status = await client.status();
      console.log(
        `Brain: ${status.docCount} docs, ${status.entityCount} entities, ${status.factCount} facts`,
      );
    } catch (err) {
      console.error(`Could not reach brain: ${err instanceof Error ? err.message : err}`);
    }
    break;
  }

  default:
    console.log(`cursor-unison — Persistent AI memory for Cursor, powered by Unison

Commands:
  mcp                              Start the MCP server (stdio)
  login --email <email>            Authenticate with the Unison brain
  login --email <email> --recover  Rotate/recover your API key
  logout                           Remove stored credentials
  status                           Show authentication + brain status`);
    if (command) process.exit(1);
}
