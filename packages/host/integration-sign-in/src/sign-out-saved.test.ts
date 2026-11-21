import { approvedSignIns } from "@halonicjs/format";
import { type ApprovedSignIn, createSignInGrants } from "@halonicjs/oauth-sign-in";
import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  exampleSheet,
  fakeClientSecret,
  fakeRefreshToken,
  signInName,
  webDigest,
} from "./fake-integration.test-helper.ts";
import { signOutSavedSignIns } from "./sign-out-saved.ts";

/** The example sign-in as the person approved it. */
function approved(): ApprovedSignIn {
  const result = approvedSignIns(exampleSheet(), { clientId: "fake-client" });
  if (!result.ok) throw new Error("the example sheet doesn't fill in");
  return result.value[signInName] as ApprovedSignIn;
}

/** Saved grants over a map, and a provider that keeps every address it was sent to. */
async function setup(saved: ApprovedSignIn) {
  const values = new Map<string, string>();
  const grants = createSignInGrants(
    {
      get: async (name) => values.get(name) ?? null,
      set: async (name, value) => void values.set(name, value),
      remove: async (name) => void values.delete(name),
    },
    webDigest,
  );
  await grants.save("example", signInName, { refreshToken: fakeRefreshToken, approved: saved });
  const sentTo: string[] = [];
  const http: HttpClient = {
    async fetch(url) {
      sentTo.push(url);
      return new Response(null, { status: 200 });
    },
  };
  const signOut = () =>
    signOutSavedSignIns({
      integration: "example",
      signIns: [signInName],
      grants,
      http,
      secrets: { get: async () => fakeClientSecret },
      requestSignal: () => new AbortController().signal,
    });
  return { values, sentTo, signOut };
}

verifies("integration-sign-in.sign-out-all", () => {
  it("signs out each saved sign-in outside the host, as the host does", async () => {
    const { values, sentTo, signOut } = await setup(approved());

    expect(await signOut()).toEqual([
      { signIn: signInName, result: { kind: "signedOut", revoke: "revoked" } },
    ]);
    expect(sentTo).toEqual(["https://auth.example.com/oauth/revoke"]);
    expect(values.size).toBe(0);
  });

  it("sends nothing to an address that isn't https, and still removes the grant", async () => {
    const { values, sentTo, signOut } = await setup({
      ...approved(),
      revokeUrl: "http://auth.example.com/oauth/revoke",
    });

    expect(await signOut()).toEqual([
      { signIn: signInName, result: { kind: "signedOut", revoke: "notConfirmed" } },
    ]);
    expect(sentTo).toEqual([]);
    expect(values.size).toBe(0);
  });
});
