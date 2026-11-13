/**
 * The permission sheet of the example integration, as the build writes it: one sign-in whose client ID
 * is a setting, its client secret and its access token for `api.example.com`. Every value is fake.
 */
export function exampleSheetRecord(): Record<string, unknown> {
  return {
    id: "example",
    version: "1.0.0",
    kit: 2,
    provides: ["connector"],
    hosts: ["api.example.com", "cdn.example.com"],
    secrets: { "example-client": { purpose: "The client secret of your Example app." } },
    signIns: {
      "example-account": {
        purpose: "Access to your Example account.",
        flow: "oauth-code",
        authorizeUrl: "https://auth.example.com/oauth/authorize",
        tokenUrl: "https://auth.example.com/oauth/token",
        revokeUrl: "https://auth.example.com/oauth/revoke",
        clientId: { fromSetting: "clientId" },
        clientSecret: "example-client",
        clientAuth: "post",
        scopes: [{ scope: "projects.read", reason: "Reads your projects." }],
        access: { hosts: ["api.example.com"], as: "bearer" },
      },
    },
  };
}

/** The one sign-in's name in {@link exampleSheetRecord}. */
export const signInName = "example-account";

/** The name of the client secret in {@link exampleSheetRecord}. */
export const clientSecretName = "example-client";
