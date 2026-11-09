import { ManualClock, MemoryRecordStore, MemorySecrets } from "@halonicjs/adapter-memory";
import { encodeBase64url } from "@halonicjs/std";
import { createTokenStore, tokenCollection, tokenKeySecret } from "../src/index.ts";

/** Sets a token, reads it back under another spelling, removes it, and never returns the token. */
export async function runExample(): Promise<{
  readBack: boolean;
  storedAsPlainText: boolean;
  afterRemove: string | null;
}> {
  // The records, the key and the clock are all passed in. Here they are in memory; on a server
  // `records` is a store agents can't write to and `secrets` reads the configured `token-key`.
  const records = new MemoryRecordStore();
  const key = encodeBase64url(crypto.getRandomValues(new Uint8Array(32))); // 32 random bytes
  const secrets = new MemorySecrets({ [tokenKeySecret]: key });
  const clock = new ManualClock("2026-11-09T07:00:00.000Z");

  const tokens = createTokenStore({ records, secrets, clock });
  const refreshToken = "example-refresh-token"; // a made-up value; never print a real one

  await tokens.set("google-refresh", refreshToken);

  // Case and `-` versus `_` don't matter: both spellings name the same token.
  const readBack = (await tokens.get("Google_Refresh")) === refreshToken; // true

  // The record store holds the sealed value, not the token.
  const stored = JSON.stringify(await records.changes(tokenCollection));
  const storedAsPlainText = stored.includes(refreshToken); // false

  await tokens.remove("google-refresh");
  const afterRemove = await tokens.get("google-refresh"); // null

  return { readBack, storedAsPlainText, afterRemove };
}
