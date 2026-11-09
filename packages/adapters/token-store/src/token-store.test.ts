import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  fixedClock,
  type MemoryRecords,
  type MemorySecrets,
  memoryRecords,
  memorySecrets,
  randomTokenKey,
} from "./fakes.test-helper.ts";
import { UnreadableTokenError } from "./sealed-value.ts";
import { tokenKeySecret } from "./token-key.ts";
import { createTokenStore, tokenCollection } from "./token-store.ts";

// Long enough that it can't turn up in random bytes by chance.
const refreshToken = "1//refresh-token-for-the-plain-text-check";

interface Setup {
  readonly records: MemoryRecords;
  readonly secrets: MemorySecrets;
}

/** A store over fresh fakes. `null` leaves the token key unset. */
function setup(key: string | null = randomTokenKey()): Setup & {
  tokens: ReturnType<typeof createTokenStore>;
} {
  const records = memoryRecords();
  const secrets = memorySecrets(key === null ? {} : { [tokenKeySecret]: key });
  return { records, secrets, tokens: createTokenStore({ records, secrets, clock: fixedClock }) };
}

/** Every form the token could show up in if it were stored readable. */
function readableForms(value: string): string[] {
  const bytes = new TextEncoder().encode(value);
  const base64 = btoa(String.fromCharCode(...bytes));
  return [value, base64, base64.replace(/=+$/, ""), encodeBase64url(bytes)];
}

verifies("token-store.get-set-remove", () => {
  it("stores, replaces and removes a token", async () => {
    const { tokens } = setup();
    expect(await tokens.get("google-refresh")).toBeNull();
    await tokens.set("google-refresh", "first");
    expect(await tokens.get("google-refresh")).toBe("first");
    await tokens.set("google-refresh", "second");
    expect(await tokens.get("google-refresh")).toBe("second");
    await tokens.remove("google-refresh");
    expect(await tokens.get("google-refresh")).toBeNull();
  });

  it("treats names that differ in case or - versus _ as one token", async () => {
    const { tokens, records } = setup();
    await tokens.set("Google-Refresh", "value");
    expect(await tokens.get("google_refresh")).toBe("value");
    await tokens.remove("GOOGLE_REFRESH");
    expect(await tokens.get("google-refresh")).toBeNull();
    expect(new Set(records.appended.map((change) => change.id))).toEqual(
      new Set(["google_refresh"]),
    );
  });

  it("keeps tokens with different names apart", async () => {
    const { tokens } = setup();
    await tokens.set("a", "one");
    await tokens.set("b", "two");
    await tokens.remove("a");
    expect(await tokens.get("a")).toBeNull();
    expect(await tokens.get("b")).toBe("two");
  });

  it("stores an empty value as a value, not as no token", async () => {
    const { tokens } = setup();
    await tokens.set("empty", "");
    expect(await tokens.get("empty")).toBe("");
  });

  it("keeps any Unicode text", async () => {
    const { tokens } = setup();
    await tokens.set("text", "ünïcødé ✓ 🔑");
    expect(await tokens.get("text")).toBe("ünïcødé ✓ 🔑");
  });

  it("does nothing when removing a token that isn't there", async () => {
    const { tokens, records } = setup();
    await tokens.remove("missing");
    expect(records.log).toEqual([]);
  });

  it("throws RangeError for a bad name before reading or writing anything", async () => {
    const { tokens, records, secrets } = setup();
    await expect(tokens.get("1bad")).rejects.toBeInstanceOf(RangeError);
    await expect(tokens.set("bad name", "value")).rejects.toBeInstanceOf(RangeError);
    await expect(tokens.remove("")).rejects.toBeInstanceOf(RangeError);
    expect(records.log).toEqual([]);
    expect(secrets.reads.size).toBe(0);
  });
});

verifies("token-store.change-log", () => {
  it("writes add, update and remove to the _tokens collection, stamped by the clock", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", "one");
    await tokens.set("refresh", "two");
    await tokens.remove("refresh");
    expect(
      records.appended.map(({ collection, id, op, at }) => ({ collection, id, op, at })),
    ).toEqual(
      ["add", "update", "remove"].map((op) => ({
        collection: tokenCollection,
        id: "refresh",
        op,
        at: "2026-11-08T12:00:00.000Z",
      })),
    );
    expect(records.appended[2]?.values).toBeNull();
    expect(records.appended.every((change) => change.by === undefined)).toBe(true);
  });

  it("uses a collection name no user collection can have", () => {
    // A copy of the id rule in packages/core/format/src/shared/fields.ts.
    // Update it here if that rule changes, or this test can't notice.
    expect(tokenCollection).not.toMatch(/^[a-z0-9][a-z0-9-_]*$/);
  });

  it("reads a seeded record like an added one", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", "seeded");
    const added = records.log[0];
    if (added === undefined) {
      throw new Error("expected one change");
    }
    records.log.splice(0, 1, { ...added, op: "seed" });
    expect(await tokens.get("refresh")).toBe("seeded");
  });

  it("merges an update into the values before it", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", "kept");
    records.log.push({ ...fixedChange(), op: "update", values: { note: "unrelated" } });
    expect(await tokens.get("refresh")).toBe("kept");
  });
});

verifies("token-store.old-values-removed", () => {
  /** The sealed value of the token's current record in the log. */
  function sealedNow(records: MemoryRecords): string {
    const sealed = records.log.at(-1)?.values?.["sealed"];
    if (typeof sealed !== "string") {
      throw new Error("expected a sealed value in the log");
    }
    return sealed;
  }

  it("keeps no trace of a replaced token's ciphertext", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", "old");
    const oldSealed = sealedNow(records);
    await tokens.set("refresh", "new");
    expect(JSON.stringify(records.log)).not.toContain(oldSealed);
    expect(records.log.map(({ id, op }) => ({ id, op }))).toEqual([{ id: "refresh", op: "seed" }]);
    expect(await tokens.get("refresh")).toBe("new");
  });

  it("keeps no trace of a removed token, and leaves the others", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", "removed");
    const removedSealed = sealedNow(records);
    await tokens.set("other", "kept");
    await tokens.remove("refresh");
    expect(JSON.stringify(records.log)).not.toContain(removedSealed);
    expect(records.log.map(({ id }) => id)).toEqual(["other"]);
    expect(await tokens.get("other")).toBe("kept");
  });

  it("doesn't compact when a token is first added", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", "first");
    expect(records.log.map(({ op }) => op)).toEqual(["add"]);
  });
});

verifies("token-store.encrypted-at-rest", () => {
  it("never stores the token as readable text, anywhere in the log", async () => {
    const { tokens, records } = setup();
    await tokens.set("google-refresh", refreshToken);
    await tokens.set("google-refresh", `${refreshToken}-rotated`);
    const log = JSON.stringify(await records.changes(tokenCollection));
    for (const form of [
      ...readableForms(refreshToken),
      ...readableForms(`${refreshToken}-rotated`),
    ]) {
      expect(log).not.toContain(form);
    }
  });

  it("seals the same value to different bytes each time", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", refreshToken);
    await tokens.set("refresh", refreshToken);
    const [first, second] = records.log.map((change) => change.values?.["sealed"]);
    expect(typeof first).toBe("string");
    expect(first).not.toBe(second);
  });

  it("won't open a value copied to another token name", async () => {
    const { tokens, records } = setup();
    await tokens.set("source", refreshToken);
    records.log.push({ ...fixedChange(), id: "target", values: records.log[0]?.values ?? null });
    await expect(tokens.get("target")).rejects.toThrow(UnreadableTokenError);
  });

  it("throws, rather than returning null, for a changed value", async () => {
    const { tokens, records } = setup();
    await tokens.set("refresh", refreshToken);
    const sealed = String(records.log[0]?.values?.["sealed"]);
    const last = sealed.at(-1) === "A" ? "B" : "A";
    records.log.push({
      ...fixedChange(),
      op: "update",
      values: { sealed: `${sealed.slice(0, -1)}${last}` },
    });
    await expect(tokens.get("refresh")).rejects.toThrow('The token "refresh" is damaged');
  });

  it("throws for a record without a sealed value, naming the token", async () => {
    const { tokens, records } = setup();
    records.log.push({ ...fixedChange(), values: {} });
    await expect(tokens.get("Refresh")).rejects.toThrow(
      new UnreadableTokenError(
        'The token "Refresh" is damaged or was changed, so it can\'t be opened.',
      ),
    );
  });

  it.each([
    ["isn't base64url", () => "not base64url!"],
    ["was cut short, as a half-written write leaves it", (sealed: string) => sealed.slice(0, 28)],
  ])("throws for a sealed value that %s, naming the token", async (_, damage) => {
    const { tokens, records } = setup();
    await tokens.set("refresh", refreshToken);
    const sealed = String(records.log[0]?.values?.["sealed"]);
    records.log.push({ ...fixedChange(), op: "update", values: { sealed: damage(sealed) } });
    const error = await tokens.get("refresh").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnreadableTokenError);
    expect((error as Error).message).toBe(
      'The token "refresh" is damaged or was changed, so it can\'t be opened.',
    );
  });

  it("throws for a value in an unknown format", async () => {
    const { tokens, records } = setup();
    records.log.push({
      ...fixedChange(),
      values: { sealed: encodeBase64url(new Uint8Array(40).fill(2)) },
    });
    await expect(tokens.get("refresh")).rejects.toThrow("a format this version doesn't know");
  });

  it("names a different key, and never shows the value", async () => {
    const records = memoryRecords();
    const write = createTokenStore({
      records,
      secrets: memorySecrets({ [tokenKeySecret]: randomTokenKey() }),
      clock: fixedClock,
    });
    await write.set("refresh", refreshToken);
    const read = createTokenStore({
      records,
      secrets: memorySecrets({ [tokenKeySecret]: randomTokenKey() }),
      clock: fixedClock,
    });
    const error = await read.get("refresh").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnreadableTokenError);
    expect((error as Error).message).toContain("sealed with a different token key");
    expect((error as Error).message).not.toContain(refreshToken);
  });
});

verifies("token-store.token-key", () => {
  it("explains how to set a missing key", async () => {
    const { tokens } = setup(null);
    await expect(tokens.set("refresh", "value")).rejects.toThrow(
      "The token key isn't configured. Set the secret `token-key` to 32 random bytes in base64url.",
    );
  });

  it("refuses a key of the wrong length or form, without showing it", async () => {
    const short = encodeBase64url(new Uint8Array(16).fill(7));
    const padded = `${randomTokenKey()}=`;
    for (const key of [short, padded, "not base64url!"]) {
      const error = await setup(key)
        .tokens.set("refresh", "value")
        .catch((caught: unknown) => caught);
      expect((error as Error).message).toContain("must be 32 random bytes in base64url");
      expect((error as Error).message).not.toContain(key);
    }
  });

  it("doesn't read the key when there is nothing to open or remove", async () => {
    const { tokens, secrets } = setup(null);
    expect(await tokens.get("refresh")).toBeNull();
    await tokens.remove("refresh");
    expect(secrets.reads.get(tokenKeySecret)).toBeUndefined();
  });

  it("reads the key once, then keeps it", async () => {
    const { tokens, secrets } = setup();
    await tokens.set("a", "one");
    await tokens.set("b", "two");
    await tokens.get("a");
    expect(secrets.reads.get(tokenKeySecret)).toBe(1);
  });

  it("picks up a key set after a failed read, without a restart", async () => {
    const { tokens, secrets } = setup(null);
    await expect(tokens.set("refresh", "value")).rejects.toThrow("isn't configured");
    secrets.values.set(tokenKeySecret, "too-short");
    await expect(tokens.set("refresh", "value")).rejects.toThrow("must be 32 random bytes");
    secrets.values.set(tokenKeySecret, randomTokenKey());
    await tokens.set("refresh", "value");
    expect(await tokens.get("refresh")).toBe("value");
  });

  it("accepts a key with a trailing newline, as a key file often has", async () => {
    const { tokens } = setup(`${randomTokenKey()}\n`);
    await tokens.set("refresh", "value");
    expect(await tokens.get("refresh")).toBe("value");
  });
});

function fixedChange() {
  return {
    at: "2026-11-08T12:00:00.000Z",
    collection: tokenCollection,
    id: "refresh",
    op: "add" as const,
    values: null,
  };
}
