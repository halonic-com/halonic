import type { AllowAddressResult } from "@halonicjs/studio-feature-models/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { KeyOriginStore } from "./workspace-key-addresses.ts";
import { WorkspaceModelKeys } from "./workspace-model-keys.ts";

/** A keychain in memory, with each key's origins beside it, that records what was asked. */
function setup(unreadable = false) {
  const origins = new Map<string, string[]>([["acme-key", ["https://llm.example.com"]]]);
  const asked: string[] = [];
  const store: KeyOriginStore = {
    allowedOrigins: async (name) => {
      asked.push(name);
      if (unreadable) throw new Error("the list can't be read");
      return origins.get(name);
    },
    allowOrigin: async (name, address): Promise<AllowAddressResult> => {
      asked.push(name);
      const origin = new URL(address).origin;
      origins.set(name, [...(origins.get(name) ?? []), origin]);
      return { result: "added", origin };
    },
  };
  const keys = new WorkspaceModelKeys(
    {
      get: async () => expect.unreachable("a key must never be read for its addresses"),
      has: async () => true,
      set: async () => undefined,
      remove: async () => undefined,
    },
    store,
  );
  return { keys, origins, asked };
}

verifies("models.api-keys.key-addresses", () => {
  it("reads a key's addresses, and none for a key saved before addresses existed", async () => {
    const { keys } = setup();

    expect(await keys.addresses?.allowed("acme-key")).toEqual(["https://llm.example.com"]);
    expect(await keys.addresses?.allowed("old-key")).toBeUndefined();
  });

  it("adds an address beside the key's others, as the keychain keeps it", async () => {
    const { keys, origins } = setup();

    const answer = await keys.addresses?.allow("acme-key", "https://GATEWAY.example.com/v1");

    expect(answer).toEqual({ result: "added", origin: "https://gateway.example.com" });
    expect(origins.get("acme-key")).toEqual([
      "https://llm.example.com",
      "https://gateway.example.com",
    ]);
  });

  it("passes on a list that can't be read as an error, never as none", async () => {
    const { keys } = setup(true);

    await expect(keys.addresses?.allowed("acme-key")).rejects.toThrow("can't be read");
  });

  it("refuses Halonic's and a plugin's names before it asks the keychain", async () => {
    const { keys, asked } = setup();

    await expect(keys.addresses?.allowed("token-key")).rejects.toThrow(RangeError);
    await expect(
      keys.addresses?.allow("plugin__weather__acme-key", "https://llm.example.com"),
    ).rejects.toThrow(RangeError);
    expect(asked).toEqual([]);
  });

  it("offers the provider type's own address, and nothing for an address of its own", () => {
    const { keys } = setup();
    const anthropic = { id: "anthropic", type: "anthropic", secret: "anthropic" };

    expect(keys.addresses?.usualAddress(anthropic)).toBe("https://api.anthropic.com");
    expect(keys.addresses?.usualAddress({ ...anthropic, type: "openai" })).toBe(
      "https://api.openai.com",
    );
    expect(
      keys.addresses?.usualAddress({ ...anthropic, baseUrl: "https://gateway.example.com/v1" }),
    ).toBeUndefined();
    expect(
      keys.addresses?.usualAddress({ id: "gateway", type: "openai-compatible", secret: "gw" }),
    ).toBeUndefined();
  });

  it("has no addresses where the key store keeps none", () => {
    const keys = new WorkspaceModelKeys({
      get: async () => null,
      has: async () => false,
      set: async () => undefined,
      remove: async () => undefined,
    });

    expect(keys.addresses).toBeUndefined();
  });
});
