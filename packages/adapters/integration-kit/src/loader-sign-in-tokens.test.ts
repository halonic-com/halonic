import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  fakeSignInTokens,
  fakeTransport,
  memoryTokens,
  secrets,
  tokenCanary,
} from "./fake-transport.test-helper.ts";
import { type LoadIntegrationOptions, loadIntegration } from "./loader.ts";

/** A built-in integration whose sheet has one sign-in, as the build writes it. */
function sheetWithSignIn(): Record<string, unknown> {
  return {
    id: "example",
    version: "1.0.0",
    kit: 2,
    provides: ["connector"],
    hosts: ["api.example.com"],
    secrets: { "example-client": { purpose: "The client secret of your Example app." } },
    signIns: {
      "example-account": {
        purpose: "Access to your Example account.",
        flow: "oauth-code",
        authorizeUrl: "https://auth.example.com/authorize",
        tokenUrl: "https://auth.example.com/token",
        clientId: "example-app-id",
        clientSecret: "example-client",
        access: { hosts: ["api.example.com"], as: "bearer" },
      },
    },
  };
}

function load(overrides: Partial<LoadIntegrationOptions> = {}) {
  const fake = fakeTransport();
  const loaded = loadIntegration({
    source: {
      origin: "built-in",
      sheet: sheetWithSignIn(),
      integration: {
        name: "example",
        version: "1.0.0",
        tools: [],
        connect: () => ({ callTool: async () => "", close: async () => {} }),
      },
    },
    choices: { secretNames: { "example-client": "example-key" } },
    transport: fake.transport,
    secrets,
    tokens: memoryTokens(),
    ...overrides,
  });
  if (!loaded.ok) {
    throw new Error(JSON.stringify(loaded.error));
  }
  return { loaded: loaded.value, sent: fake.sent };
}

verifies("integration-kit.loader", () => {
  it("places the access token of a sign-in from the sign-in tokens the host gives it", async () => {
    const tokens = fakeSignInTokens();
    const { loaded, sent } = load({ signInTokens: tokens });

    await loaded.host.http.fetch("https://api.example.com/v1", {
      auth: { signIn: "example-account", as: "bearer" },
    });

    expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${tokenCanary.access}`);
    expect(tokens.asked).toEqual(["example-account"]);
  });

  it("refuses a request that places a sign-in's token when the host gives no sign-in tokens", async () => {
    const { loaded, sent } = load();

    await expect(
      loaded.host.http.fetch("https://api.example.com/v1", {
        auth: { signIn: "example-account", as: "bearer" },
      }),
    ).rejects.toMatchObject({ code: "sign-in-needed" });
    expect(sent).toEqual([]);
  });
});
