import type { Secrets } from "@halonicjs/ports";
import { decodeBase64url, errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  fixedClock,
  type MemoryRecords,
  memoryRecords,
  memorySecrets,
  randomTokenKey,
} from "./fakes.test-helper.ts";
import { madeTokenKey, TokenKeyMissingError, type TokenKeyStore } from "./made-token-key.ts";
import { tokenKeySecret } from "./token-key.ts";
import { createTokenStore } from "./token-store.ts";

/**
 * A key store held in a map, like the profile's secrets file: `setIfMissing`
 * checks and writes in one step, and every write is counted.
 */
function memoryKeyStore() {
  const values = new Map<string, string>();
  let writes = 0;
  const store: TokenKeyStore = {
    setIfMissing: async (name, value) => {
      const stored = values.get(name);
      if (stored !== undefined) return stored;
      values.set(name, value);
      writes += 1;
      return value;
    },
  };
  return { store, values, writes: () => writes };
}

/** The environment, then the key store, as the CLI and the host read them. */
function envThenStore(env: Secrets, keys: ReturnType<typeof memoryKeyStore>): Secrets {
  return {
    get: async (name) => (await env.get(name)) ?? keys.values.get(name) ?? null,
  };
}

/** A token store over `records` whose key comes from `madeTokenKey`. */
function tokensOver(records: MemoryRecords, secrets: Secrets) {
  return createTokenStore({ records, secrets, clock: fixedClock });
}

verifies("token-store.made-token-key", () => {
  it("makes a 32-byte key in a fresh profile, which a second token store then uses", async () => {
    const keys = memoryKeyStore();
    const records = memoryRecords();
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets(), keys),
      store: keys.store,
      tokenRecords: [records],
    });

    await tokensOver(records, secrets).set("google-refresh", "refresh-token-one");

    const made = keys.values.get(tokenKeySecret);
    expect(made).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(decodeBase64url(made ?? "")?.length).toBe(32);
    const again = madeTokenKey({
      secrets: envThenStore(memorySecrets(), keys),
      store: keys.store,
      tokenRecords: [records],
    });
    expect(await tokensOver(records, again).get("google-refresh")).toBe("refresh-token-one");
    expect(keys.writes()).toBe(1);
  });

  it("uses a stored key and writes nothing", async () => {
    const keys = memoryKeyStore();
    const stored = randomTokenKey();
    keys.values.set(tokenKeySecret, stored);
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets(), keys),
      store: keys.store,
      tokenRecords: [memoryRecords()],
    });

    expect(await secrets.get(tokenKeySecret)).toBe(stored);
    expect(keys.writes()).toBe(0);
  });

  it("uses the environment's key and stores none", async () => {
    const keys = memoryKeyStore();
    const fromEnv = randomTokenKey();
    const records = memoryRecords();
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets({ [tokenKeySecret]: fromEnv }), keys),
      store: keys.store,
      tokenRecords: [records],
    });

    await tokensOver(records, secrets).set("google-refresh", "refresh-token-one");

    expect(keys.values.size).toBe(0);
    const withEnvKey = tokensOver(records, memorySecrets({ [tokenKeySecret]: fromEnv }));
    expect(await withEnvKey.get("google-refresh")).toBe("refresh-token-one");
  });

  it("keeps one key when two token stores make one at the same moment", async () => {
    const keys = memoryKeyStore();
    const google = memoryRecords();
    const signIns = memoryRecords();
    const made = () =>
      madeTokenKey({
        secrets: envThenStore(memorySecrets(), keys),
        store: keys.store,
        tokenRecords: [google, signIns],
      });
    const first = tokensOver(google, made());
    const second = tokensOver(signIns, made());

    await Promise.all([first.set("google-refresh", "token-a"), second.set("grant", "token-b")]);

    expect(keys.writes()).toBe(1);
    expect(await tokensOver(google, made()).get("google-refresh")).toBe("token-a");
    expect(await tokensOver(signIns, made()).get("grant")).toBe("token-b");
  });

  it("makes no key while another store holds a sealed token, and says the key is missing", async () => {
    const google = memoryRecords();
    const signIns = memoryRecords();
    const oldKey = randomTokenKey();
    await tokensOver(signIns, memorySecrets({ [tokenKeySecret]: oldKey })).set("grant", "token");
    const keys = memoryKeyStore();
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets(), keys),
      store: keys.store,
      tokenRecords: [google, signIns],
    });

    const sealing = await tokensOver(google, secrets)
      .set("google-refresh", "token")
      .catch((error: unknown) => error);
    const opening = await tokensOver(signIns, secrets)
      .get("grant")
      .catch((error: unknown) => error);

    for (const error of [sealing, opening]) {
      expect(error).toBeInstanceOf(TokenKeyMissingError);
      expect(errorKindOf(error)).toBe("conflict");
      expect((error as Error).message).toContain("token key");
      expect((error as Error).message).not.toContain(oldKey);
    }
    expect(keys.writes()).toBe(0);
  });

  it("makes a key once the only token was removed", async () => {
    const records = memoryRecords();
    const oldTokens = tokensOver(records, memorySecrets({ [tokenKeySecret]: randomTokenKey() }));
    await oldTokens.set("google-refresh", "token");
    await oldTokens.remove("google-refresh");
    const keys = memoryKeyStore();
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets(), keys),
      store: keys.store,
      tokenRecords: [records],
    });

    await tokensOver(records, secrets).set("google-refresh", "new-token");

    expect(keys.writes()).toBe(1);
  });

  it("reads every other name as it is, and makes nothing for it", async () => {
    const keys = memoryKeyStore();
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets({ "openai-key": "sk-test" }), keys),
      store: keys.store,
      tokenRecords: [],
    });

    expect(await secrets.get("openai-key")).toBe("sk-test");
    expect(await secrets.get("other-key")).toBeNull();
    expect(keys.writes()).toBe(0);
  });

  it("makes the key from the random bytes it is given", async () => {
    const keys = memoryKeyStore();
    const secrets = madeTokenKey({
      secrets: envThenStore(memorySecrets(), keys),
      store: keys.store,
      tokenRecords: [],
      randomBytes: (count) => new Uint8Array(count).fill(1),
    });

    expect(await secrets.get("Token_Key")).toBe("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE");
  });
});
