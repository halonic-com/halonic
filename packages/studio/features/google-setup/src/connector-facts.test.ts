import { connectionStateOf } from "@halonicjs/studio-feature-library/api";
import { describe, expect, it } from "vitest";
import { record } from "./accounts.test-helper.ts";
import type { GoogleSetupAccount } from "./api.ts";
import { connectorFacts } from "./connector-facts.ts";

const signedIn = "2026-11-12T02:10:00.000Z";

function account(extra: Parameters<typeof record>[1]): GoogleSetupAccount {
  return {
    email: "ana@example.com",
    record: record([], extra),
    services: [],
    adding: [],
    routinesOnHold: 0,
    changedAt: signedIn,
    askAccountType: false,
    clientSharedWith: [],
  };
}

function stateOf(extra: Parameters<typeof record>[1]) {
  return connectionStateOf(connectorFacts(account(extra)));
}

describe("connectorFacts", () => {
  it("says not connected before the first sign-in", () => {
    expect(stateOf({})).toBe("not-connected");
  });

  it("says connected after a sign-in nobody refused", () => {
    expect(stateOf({ lastSignInAt: signedIn })).toBe("connected");
  });

  it("says needs sign-in when Google refused the sign-in", () => {
    const refused = { at: signedIn, reason: "sign-in" } as const;
    expect(stateOf({ lastSignInAt: signedIn, refreshRefused: refused })).toBe("needs-sign-in");
  });

  it("says needs new secret when Google refused the client, gone or not", () => {
    for (const reason of ["client", "client-gone"] as const) {
      const refused = { at: signedIn, reason };
      expect(stateOf({ lastSignInAt: signedIn, refreshRefused: refused })).toBe("needs-new-secret");
    }
  });
});
