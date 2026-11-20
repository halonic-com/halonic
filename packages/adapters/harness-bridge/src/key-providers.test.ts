import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeRun, noOutsideCall } from "./fakes.test-helper.ts";
import { NodeHarnessBridgeServer } from "./server.ts";

const server = new NodeHarnessBridgeServer({
  secrets: { get: async () => null },
  fetch: noOutsideCall,
});

/** Opens a bridge for a run with these providers, and gives what it says it serves with a key. */
async function keyProvidersOf(providers: ReturnType<typeof fakeRun>["providers"]) {
  const bridge = await server.open({ ...fakeRun(), providers });
  try {
    return bridge.keyProviders;
  } finally {
    await bridge.close();
  }
}

verifies("harness-bridge.key-providers", () => {
  it("names the providers it reaches with a key Halonic keeps", async () => {
    expect(
      await keyProvidersOf({
        openai: { kind: "key", secret: "openai-key" },
        anthropic: { kind: "key", secret: "anthropic-key" },
      }),
    ).toEqual(["anthropic", "openai"]);
  });

  it("names none where the program signs in with its own account", async () => {
    expect(
      await keyProvidersOf({
        anthropic: { kind: "sign-in" },
        openai: { kind: "key", secret: "openai-key" },
      }),
    ).toEqual(["openai"]);
    expect(await keyProvidersOf({ anthropic: { kind: "sign-in" } })).toBeUndefined();
  });
});
