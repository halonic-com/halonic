import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientSecretError } from "./client-secret-error.ts";
import { clientSecretStore } from "./client-secret-store.ts";
import { type MemoryTokens, memoryTokens } from "./memory-tokens.test-helper.ts";

// Fake values only. They are safe from the leak check only because they have
// no GOCSPX- prefix: with it, they are long enough for its pattern to match.
const firstSecret = "fake-client-secret-one";
const secondSecret = "fake-client-secret-two";

let tokens: MemoryTokens;

function newStore() {
  tokens = memoryTokens();
  return clientSecretStore(tokens, fixedIds());
}

verifies("google-setup.save-client-secret", () => {
  it("saves the secret under google-client-<ref> and returns only the ref", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    expect(clientRef).toBe("gclient_1");
    expect(await tokens.get("google-client-gclient_1")).toBe(firstSecret);
  });

  it("makes a new ref for every save", async () => {
    const secrets = newStore();
    const first = await secrets.saveClientSecret(firstSecret);
    const second = await secrets.saveClientSecret(secondSecret);
    expect(second).not.toBe(first);
    expect(await secrets.readClientSecret(first)).toBe(firstSecret);
    expect(await secrets.readClientSecret(second)).toBe(secondSecret);
  });

  it("trims the spaces around a pasted value", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(`  ${firstSecret}\n`);
    expect(await secrets.readClientSecret(clientRef)).toBe(firstSecret);
  });

  it("refuses an empty value and saves nothing", async () => {
    const secrets = newStore();
    await expect(secrets.saveClientSecret(" \t")).rejects.toMatchObject({ reason: "empty" });
    expect(tokens.values.size).toBe(0);
  });
});

verifies("google-setup.staged-replace", () => {
  it("keeps the secret in use while a new one is staged", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    await secrets.stageClientSecret(clientRef, secondSecret);
    expect(await secrets.readClientSecret(clientRef)).toBe(firstSecret);
    expect(await secrets.readStagedClientSecret(clientRef)).toBe(secondSecret);
    expect(await tokens.get("google-client-gclient_1-staged")).toBe(secondSecret);
  });

  it("swaps the staged secret in on promote", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    await secrets.stageClientSecret(clientRef, secondSecret);
    await secrets.promote(clientRef);
    expect(await secrets.readClientSecret(clientRef)).toBe(secondSecret);
    expect(await secrets.readStagedClientSecret(clientRef)).toBeNull();
  });

  it("drops the staged secret on discard and keeps the one in use", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    await secrets.stageClientSecret(clientRef, secondSecret);
    await secrets.discard(clientRef);
    expect(await secrets.readClientSecret(clientRef)).toBe(firstSecret);
    expect(await secrets.readStagedClientSecret(clientRef)).toBeNull();
  });

  it("refuses to promote when nothing is staged", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    await expect(secrets.promote(clientRef)).rejects.toMatchObject({ reason: "nothing-staged" });
    expect(await secrets.readClientSecret(clientRef)).toBe(firstSecret);
  });

  it("refuses to stage for a ref with no saved secret", async () => {
    const secrets = newStore();
    await expect(secrets.stageClientSecret("gclient_9", secondSecret)).rejects.toMatchObject({
      reason: "not-saved",
    });
    expect(tokens.values.size).toBe(0);
  });
});

verifies("google-setup.replace-before-sign-in", () => {
  it("replaces the secret straight away and drops a staged one", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    await secrets.stageClientSecret(clientRef, "fake-client-secret-stale");
    await secrets.replaceClientSecret(clientRef, secondSecret);
    expect(await secrets.readClientSecret(clientRef)).toBe(secondSecret);
    expect(await secrets.readStagedClientSecret(clientRef)).toBeNull();
  });

  it("refuses to replace a secret that was never saved", async () => {
    const secrets = newStore();
    await expect(secrets.replaceClientSecret("gclient_9", secondSecret)).rejects.toMatchObject({
      reason: "not-saved",
    });
  });
});

verifies("google-setup.remove-client-secret", () => {
  it("removes the secret and a staged one when no other account uses the ref", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    await secrets.stageClientSecret(clientRef, secondSecret);
    expect(await secrets.removeClientSecret(clientRef, { usedByOthers: false })).toBe("removed");
    expect(tokens.values.size).toBe(0);
  });

  it("keeps the secret when another account uses the ref", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    const result = await secrets.removeClientSecret(clientRef, { usedByOthers: true });
    expect(result).toBe("kept-for-other-accounts");
    expect(await secrets.readClientSecret(clientRef)).toBe(firstSecret);
  });

  it("is not an error when nothing is saved", async () => {
    const secrets = newStore();
    expect(await secrets.removeClientSecret("gclient_9", { usedByOthers: false })).toBe("removed");
  });

  it("refuses a bad ref even when the secret is kept", async () => {
    const secrets = newStore();
    await expect(
      secrets.removeClientSecret("Not A Ref", { usedByOthers: true }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

verifies("google-setup.secret-never-shown", () => {
  const console = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const spies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    for (const method of console) {
      spies.push(vi.spyOn(globalThis.console, method).mockImplementation(() => undefined));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    spies.length = 0;
  });

  it("puts no secret in a return value, an error message or a log line", async () => {
    const secrets = newStore();
    const seen: unknown[] = [];
    const clientRef = await secrets.saveClientSecret(firstSecret);
    seen.push(clientRef);
    seen.push(await secrets.stageClientSecret(clientRef, secondSecret));
    seen.push(await secrets.promote(clientRef));
    seen.push(await secrets.replaceClientSecret(clientRef, firstSecret));
    seen.push(await secrets.discard(clientRef));
    seen.push(await secrets.promote(clientRef).catch((error: unknown) => error));
    seen.push(await secrets.stageClientSecret("gclient_9", secondSecret).catch((e: unknown) => e));
    seen.push(await secrets.removeClientSecret(clientRef, { usedByOthers: false }));

    const errors = seen.filter((value) => value instanceof ClientSecretError);
    expect(errors).toHaveLength(2);
    const shown = JSON.stringify(
      seen.map((value) => (value instanceof Error ? value.message : value)),
    );
    for (const secret of [firstSecret, secondSecret]) {
      expect(shown).not.toContain(secret);
    }
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("keeps the secret out of the error when the ref and the value are swapped", async () => {
    const secrets = newStore();
    const clientRef = await secrets.saveClientSecret(firstSecret);
    // Short enough for the leak check, shaped like a real secret otherwise.
    const pasted = "GOCSPX-fake";
    const swapped = [
      await secrets.stageClientSecret(pasted, clientRef).catch((error: unknown) => error),
      await secrets.replaceClientSecret(pasted, clientRef).catch((error: unknown) => error),
      await secrets.stageClientSecret(secondSecret, clientRef).catch((error: unknown) => error),
    ];
    for (const error of swapped) {
      expect(error).toBeInstanceOf(RangeError);
      expect((error as RangeError).message).not.toContain(pasted);
      expect((error as RangeError).message).not.toContain(secondSecret);
    }
    expect(await secrets.readClientSecret(clientRef)).toBe(firstSecret);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("ClientSecretError", () => {
  it("has a fixed message for every reason", () => {
    for (const reason of ["empty", "not-saved", "nothing-staged"] as const) {
      const error = new ClientSecretError(reason);
      expect(error.name).toBe("ClientSecretError");
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});
