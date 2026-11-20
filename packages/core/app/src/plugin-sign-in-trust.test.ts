import type { IntegrationSignIn } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  declaredSignInTrustFacts,
  type PluginDeclaredHost,
  pluginClientSecretHosts,
  signInTokenHostDiffers,
  signInTokenHostWarning,
  signInTrustLine,
} from "./plugin-sign-in-trust.ts";
import { pluginTrustChanges } from "./plugin-trust-changes.ts";
import { pluginTrustContent } from "./plugin-trust-content.ts";
import { pluginTrustSections } from "./plugin-trust-sections.ts";
import { pluginFrom, signInPlugin, weatherFiles } from "./testing/plugin-fixtures.ts";

/** A host as a trust check words it: a host name, or the setting that holds it. */
const words = (host: PluginDeclaredHost) =>
  typeof host === "string" ? host : `the address in ${host.fromSetting}`;

const account = (): IntegrationSignIn => {
  const signIn = signInPlugin().backend?.signIns["account"];
  if (signIn === undefined) throw new Error("the fixture has the sign-in account");
  return signIn;
};

const acme = () => pluginTrustContent({ plugin: signInPlugin(), files: weatherFiles });

verifies("app.plugin-sign-in-trust", () => {
  it("words a sign-in's hosts as the sheet declares them, before any setting is set", () => {
    expect(declaredSignInTrustFacts(account(), words)).toEqual({
      authorizeHost: "the address in server",
      tokenHost: "the address in server",
      scopeReasons: ["read your projects"],
      accessHosts: ["the address in server"],
    });
  });

  it("gives the approved trust line, and leaves out what it can do without scopes", () => {
    const facts = {
      authorizeHost: "auth.example.com",
      tokenHost: "auth.example.com",
      scopeReasons: ["read your projects"],
      accessHosts: ["api.example.com", "files.example.com"],
    };
    expect(signInTrustLine("Acme", facts)).toBe(
      "Signs in to your Acme account at auth.example.com. Halonic gets the tokens from auth.example.com. It can: read your projects. The sign-in is used only with api.example.com and files.example.com.",
    );
    expect(signInTrustLine("Acme", { ...facts, scopeReasons: [] })).toBe(
      "Signs in to your Acme account at auth.example.com. Halonic gets the tokens from auth.example.com. The sign-in is used only with api.example.com and files.example.com.",
    );
  });

  it("warns when the sign-in page and the token address are different services, but not for Google's known pair", () => {
    const base = { scopeReasons: [], accessHosts: ["api.example.com"] };
    const split = { ...base, authorizeHost: "auth.example.com", tokenHost: "tokens.example.net" };
    expect(signInTokenHostDiffers(split)).toBe(true);
    expect(signInTokenHostWarning(split)).toBe(
      "The sign-in page and the token address are different services: auth.example.com and tokens.example.net. Only continue if you expect that.",
    );
    const google = {
      ...base,
      authorizeHost: "accounts.google.com",
      tokenHost: "oauth2.googleapis.com",
    };
    expect(signInTokenHostDiffers(google)).toBe(false);
    expect(signInTokenHostDiffers(declaredSignInTrustFacts(account(), words))).toBe(false);
  });

  it("sends a client secret only to its sign-in's token and revoke hosts", () => {
    expect(pluginClientSecretHosts(signInPlugin(), "acme-client")).toEqual([
      { fromSetting: "server" },
      "revoke.example.com",
    ]);
    expect(pluginClientSecretHosts(signInPlugin(), "another")).toEqual([]);
  });
});

verifies("app.plugin-trust-content", () => {
  it("keeps each sign-in as the sheet writes it, by name", () => {
    expect(acme().signIns).toEqual([{ name: "account", ...account() }]);
  });

  it("lists a sign-in's client secret with the token and revoke hosts it may go to", () => {
    expect(acme().secrets).toEqual([
      {
        part: "backend",
        name: "acme-client",
        purpose: "The Acme app's client secret",
        hosts: [{ fromSetting: "server" }, "revoke.example.com"],
        optional: false,
      },
    ]);
  });

  it("leaves sign-ins out of a plugin without them, so its content is what it was", () => {
    expect(pluginTrustContent({ plugin: pluginFrom(), files: weatherFiles })).not.toHaveProperty(
      "signIns",
    );
  });
});

verifies("app.plugin-trust-sections", () => {
  it("shows Sign-ins after Secrets", () => {
    expect(pluginTrustSections(acme())).toEqual([
      "tools",
      "secrets",
      "sign-ins",
      "addresses",
      "in-studio",
    ]);
  });
});

verifies("app.plugin-trust-changes", () => {
  it("names a sign-in that was added, changed or removed", () => {
    const before = acme();
    const changed = signInPlugin();
    const backend = changed.backend;
    if (backend === undefined) throw new Error("the fixture has a backend");
    const signIn = account();
    const plugin = {
      ...changed,
      backend: {
        ...backend,
        signIns: {
          account: { ...signIn, tokenUrl: "https://tokens.example.net/token" },
          admin: { ...signIn, purpose: "Your Acme admin" },
        },
      },
    };
    const changes = pluginTrustChanges(before, pluginTrustContent({ plugin, files: weatherFiles }));
    if (!changes.readable) throw new Error("the content is plugin content");
    expect(changes.signIns.added.map((item) => item.name)).toEqual(["admin"]);
    expect(changes.signIns.changed.map((change) => change.fields)).toEqual([["tokenUrl"]]);
    expect(changes.signIns.removed).toEqual([]);
  });

  it("reads a record from before sign-ins were kept as one without sign-ins", () => {
    const old = pluginTrustContent({ plugin: pluginFrom(), files: weatherFiles });
    const changes = pluginTrustChanges(old, old);
    expect(changes.readable && changes.signIns).toEqual({ added: [], changed: [], removed: [] });
  });
});
