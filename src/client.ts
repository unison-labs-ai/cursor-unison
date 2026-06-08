import { BrainClient } from "@unisonlabs/sdk";

export function createBrainClient(token: string, baseUrl: string): BrainClient {
  return new BrainClient({ baseUrl, token });
}
