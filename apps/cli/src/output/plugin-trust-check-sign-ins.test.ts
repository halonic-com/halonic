import { pluginTrustContent } from "@halonicjs/app";
import { type IntegrationSignIn, type Plugin, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { pluginTrustCheckLines } from "./plugin-trust-check.ts";

const manifest = `id: acme
version: 1.0.0
sdk: 2
name: Acme
description: Your Acme projects.
backend:
  hosts: [api.example.com, { fromSetting: server, class: public }]
  tools:
    - { name: list-projects, description: Lists your projects., risk: read, untrusted: true }
ui:
  settings:
    server: { label: Server address, type: text, required: true }
`;

const signIn: IntegrationSignIn = {
  purpose: "Your Acme projects",
  flow: "oauth-code",
  authorizeUrl: "https://auth.example.com/oauth/authorize",
  tokenUrl: "https://tokens.example.net/oauth/token",
  clientId: "example-client",
  clientSecret: "acme-client",
  clientAuth: "post",
  scopes: [{ scope: "read_api", reason: "read your projects" }],
  access: { hosts: ["api.example.com", { fromSetting: "server" }], as: "bearer" },
};

/**
 * A plugin whose backend signs in. The `plugin` kind still refuses a backend
 * with sign-ins until the agent host runs them (HAL-8613), so the sign-in is
 * added to the parsed manifest. Example data only.
 */
function acme(): Plugin {
  const parsed = parseFile("plugin", manifest);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  const plugin = parsed.value.value;
  const backend = plugin.backend;
  if (backend === undefined) throw new Error("the fixture has a backend");
  return {
    ...plugin,
    backend: {
      ...backend,
      secrets: { "acme-client": { purpose: "The Acme app's client secret" } },
      signIns: { account: signIn },
    },
  };
}

const lines = () =>
  pluginTrustCheckLines(
    pluginTrustContent({ plugin: acme(), files: [] }),
    "/profile/plugins/acme",
  ).map(plainText);

verifies("app.plugin-sign-in-trust", () => {
  it("shows each sign-in after Secrets with its purpose, the trust line and the token host warning", () => {
    const shown = lines();
    const start = shown.indexOf("Sign-ins");
    expect(shown.indexOf("Secrets")).toBeLessThan(start);
    expect(shown.slice(start, start + 4)).toEqual([
      "Sign-ins",
      "  account       Your Acme projects",
      "                Signs in to your Acme account at auth.example.com. Halonic gets the tokens from tokens.example.net. It can: read your projects. The sign-in is used only with api.example.com and the address in the setting server.",
      "                ! The sign-in page and the token address are different services: auth.example.com and tokens.example.net. Only continue if you expect that.",
    ]);
  });

  it("says where the client secret goes: the token host only", () => {
    expect(lines()).toContain("  acme-client   goes only to tokens.example.net");
  });
});
