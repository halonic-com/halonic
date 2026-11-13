import type { Digest } from "@halonicjs/ports";
import type { ApprovedSignIn } from "./approved-sign-in.ts";

/** A sign-in with fake values: `example.com` addresses and a made-up client. */
export const approvedExample: ApprovedSignIn = {
  flow: "oauth-code",
  authorizeUrl: "https://auth.example.com/oauth/authorize?prompt=consent",
  tokenUrl: "https://auth.example.com/oauth/token",
  revokeUrl: "https://auth.example.com/oauth/revoke",
  issuer: "https://auth.example.com",
  clientId: "fake-client",
  clientAuth: "post",
  clientSecretName: "example-client",
  scopes: ["projects.read", "profile"],
  accessHosts: ["api.example.com", "files.example.com"],
  as: "bearer",
};

/** The platform's SHA-256, as the host gives it to the package. */
export const webDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data)));
  },
};
