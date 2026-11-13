import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approvedExample, webDigest } from "./approved-sign-in.test-helper.ts";
import { type ApprovedSignIn, approvedSignInHash } from "./approved-sign-in.ts";

const hashOf = (signIn: ApprovedSignIn) => approvedSignInHash(signIn, webDigest);

verifies("oauth-sign-in.approved-sign-in-hash", () => {
  it("is sha256: and 64 hex characters", async () => {
    expect(await hashOf(approvedExample)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes when any resolved value changes", async () => {
    const original = await hashOf(approvedExample);
    const { revokeUrl: _revokeUrl, clientSecretName: _secret, ...bare } = approvedExample;
    const changes: ApprovedSignIn[] = [
      { ...approvedExample, authorizeUrl: "https://auth.example.com/oauth/authorize?prompt=none" },
      { ...approvedExample, tokenUrl: "https://auth.example.org/oauth/token" },
      { ...approvedExample, revokeUrl: "https://evil.example.com/revoke" },
      { ...bare, clientSecretName: "example-client" },
      { ...approvedExample, issuer: "https://auth.example.org" },
      { ...approvedExample, clientId: "other-client" },
      { ...approvedExample, clientAuth: "basic" },
      { ...approvedExample, clientSecretName: "other-secret" },
      { ...bare, revokeUrl: "https://auth.example.com/oauth/revoke" },
      { ...approvedExample, scopes: ["projects.read"] },
      { ...approvedExample, accessHosts: ["api.example.com"] },
      { ...approvedExample, as: "header", header: "X-Token" },
      { ...approvedExample, prefix: "Token" },
    ];
    for (const change of changes) {
      expect(await hashOf(change), JSON.stringify(change)).not.toBe(original);
    }
  });

  it("doesn't depend on the order of scopes or hosts", async () => {
    const reordered = {
      ...approvedExample,
      scopes: [...approvedExample.scopes].reverse(),
      accessHosts: [...approvedExample.accessHosts].reverse(),
    };
    expect(await hashOf(reordered)).toBe(await hashOf(approvedExample));
  });
});
