import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readPublicKeySet } from "./public-key-set.ts";
import { makeTestKey } from "./signed-request.test-helper.ts";

verifies("signed-request.public-key-set", () => {
  it("finds each key for its own job only", async () => {
    const session = await makeTestKey("session-1");
    const command = await makeTestKey("command-1");
    const read = await readPublicKeySet({
      keys: [
        { id: "session-1", use: "session", publicKey: session.publicText },
        { id: "command-1", use: "command", publicKey: command.publicText },
      ],
    });
    if (!read.ok) {
      throw new Error(`the set was refused: ${read.error.reason}`);
    }
    expect(read.value.find("session-1", "session")).toBeDefined();
    expect(read.value.find("command-1", "command")).toBeDefined();
    expect(read.value.find("session-1", "command")).toBeUndefined();
    expect(read.value.find("command-1", "session")).toBeUndefined();
    expect(read.value.find("other", "command")).toBeUndefined();
    expect(read.value.ids("command")).toEqual(["command-1"]);
  });

  it("refuses the whole set for one bad key, naming its position", async () => {
    const good = await makeTestKey("command-1");
    const read = await readPublicKeySet({
      keys: [
        { id: "command-1", use: "command", publicKey: good.publicText },
        { id: "command-2", use: "command", publicKey: encodeBase64url(new Uint8Array(31)) },
      ],
    });
    expect(read).toEqual({ ok: false, error: { reason: "bad_public_key", index: 1 } });
  });

  it("refuses a set where two keys share an id", async () => {
    const first = await makeTestKey("command-1");
    const second = await makeTestKey("command-1");
    const read = await readPublicKeySet({
      keys: [
        { id: "command-1", use: "command", publicKey: first.publicText },
        { id: "command-1", use: "session", publicKey: second.publicText },
      ],
    });
    expect(read).toEqual({ ok: false, error: { reason: "duplicate_id", index: 1 } });
  });

  it.each([
    [{ id: "k1", use: "webhook", publicKey: "x" }],
    [{ id: "k 1", use: "command", publicKey: "x" }],
    [{ id: "k1", use: "command" }],
    ["k1"],
  ])("refuses a malformed entry %j", async (entry) => {
    expect(await readPublicKeySet({ keys: [entry] })).toEqual({
      ok: false,
      error: { reason: "bad_entry", index: 0 },
    });
  });

  it.each([[null], [[]], [{ keys: "k1" }]])("refuses %j as not a key set", async (value) => {
    expect(await readPublicKeySet(value)).toEqual({
      ok: false,
      error: { reason: "not_a_key_set" },
    });
  });
});
