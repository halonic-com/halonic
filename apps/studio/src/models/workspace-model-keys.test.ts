import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceModelKeys } from "./workspace-model-keys.ts";

function setup() {
  const stored = new Map<string, string>();
  const keys = new WorkspaceModelKeys({
    get: async () => expect.unreachable("a key must never be read to tell whether it is stored"),
    has: async (name) => stored.has(name),
    set: async (name, value) => void stored.set(name, value),
    remove: async (name) => void stored.delete(name),
  });
  return { stored, keys };
}

verifies("models.api-keys.enter-key", () => {
  it("keeps the key in the keychain of this computer", async () => {
    const { stored, keys } = setup();

    await keys.save("anthropic", new SecretText("sk-acme-test-123"));

    expect(stored.get("anthropic")).toBe("sk-acme-test-123");
    expect(keys.entry).toEqual({ kind: "field", keptOn: "this-computer", offHostHttps: false });
  });

  it("refuses the names that belong to Halonic, and never repeats the key", async () => {
    const { stored, keys } = setup();

    const refused = keys.save("token-key", new SecretText("sk-acme-test-123"));

    await expect(refused).rejects.toThrow(RangeError);
    await expect(refused).rejects.not.toThrow(/sk-acme/);
    expect(stored.size).toBe(0);
  });
});

verifies("models.api-keys.key-status", () => {
  it("says whether a key is stored, and removes it", async () => {
    const { keys } = setup();
    expect(await keys.stored("anthropic")).toBe(false);

    await keys.save("anthropic", new SecretText("sk-acme-test-123"));
    expect(await keys.stored("anthropic")).toBe(true);

    await keys.remove("anthropic");
    expect(await keys.stored("anthropic")).toBe(false);
  });

  it("refuses to read a plugin's secret", async () => {
    const { keys } = setup();

    await expect(keys.stored("plugin__weather__acme-key")).rejects.toThrow(RangeError);
  });
});
