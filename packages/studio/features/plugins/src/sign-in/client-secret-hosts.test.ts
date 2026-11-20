import { type Plugin, parseFile, pluginFromIntegrationSheet } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { secretHosts } from "../settings/plugin-settings-section.tsx";
import { trustCheckContent } from "../trust/trust-check.ts";
import { clientSecretHosts, clientSecretNames } from "./client-secret-hosts.ts";

/**
 * An integration whose sign-in sends its client secret to auth.example.com
 * (token) and login.example.com (sign-in and revoke).
 */
function acme(revokeUrl = "https://login.example.com/oauth/revoke"): Plugin {
  const parsed = parseFile(
    "integration",
    `id: acme
version: 1.0.0
kit: 2
provides: [connector]
hosts: [api.example.com]
secrets:
  acme-client: { purpose: The client secret of your Acme app. }
signIns:
  account:
    purpose: Access to your Acme account.
    flow: oauth-code
    authorizeUrl: "https://login.example.com/oauth/authorize"
    tokenUrl: "https://auth.example.com/oauth/token"
    revokeUrl: "${revokeUrl}"
    clientId: abc123
    clientSecret: acme-client
    access: { hosts: [api.example.com], as: bearer }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return pluginFromIntegrationSheet(parsed.value.value);
}

verifies("plugins.plugin-client-secrets", () => {
  describe("clientSecretHosts", () => {
    it("is the token and the revoke URL's hosts of the sign-in that names the secret", () => {
      expect(clientSecretHosts(acme(), "acme-client")).toEqual([
        "auth.example.com",
        "login.example.com",
      ]);
    });

    it("names a host once when both URLs are on it", () => {
      expect(
        clientSecretHosts(acme("https://auth.example.com/oauth/revoke"), "acme-client"),
      ).toEqual(["auth.example.com"]);
    });

    it("is empty for a secret no sign-in names", () => {
      expect(clientSecretHosts(acme(), "other")).toEqual([]);
    });
  });

  it("lists the client secrets a sign-in names", () => {
    expect(clientSecretNames(acme())).toEqual(["acme-client"]);
  });

  it("says in Settings where a client secret is sent", () => {
    expect(secretHosts(acme(), "acme-client")).toBe("auth.example.com and login.example.com");
  });

  it("lists a client secret in the trust check with where it goes", () => {
    const content = trustCheckContent(acme());

    expect(content.secrets).toEqual([
      {
        name: "acme-client",
        goesTo: ["auth.example.com", "login.example.com"],
        how: undefined,
        givenTo: undefined,
        kind: "backend",
      },
    ]);
    expect(content.counts.secrets).toBe(1);
  });
});
