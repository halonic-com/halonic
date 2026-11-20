import type { Plugin } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeWithSignIn as acme } from "../test-support/plugins.ts";
import { type SignInFacts, signInFacts, tokenHostDiffers } from "./sign-in-facts.ts";
import {
  outcomeLine,
  SIGN_IN_CHANGED,
  signedOutNotConfirmed,
  tokenHostWarning,
  trustLine,
} from "./sign-in-text.ts";

function factsOf(plugin: Plugin): SignInFacts {
  const facts = signInFacts(plugin, { clientId: "abc123" });
  if (facts.kind !== "resolved" || facts.signIns[0] === undefined) throw new Error("not resolved");
  return facts.signIns[0];
}

const facts: SignInFacts = {
  signIn: "account",
  purpose: "Access to your Acme account.",
  authorizeHost: "auth.example.com",
  tokenHost: "auth.example.com",
  scopeReasons: ["read your projects"],
  accessHosts: ["api.example.com"],
};

verifies("plugins.plugin-sign-in-text", () => {
  describe("signInFacts", () => {
    it("fills in the hosts and the scopes' reasons from the sheet and the settings", () => {
      expect(factsOf(acme())).toEqual({
        signIn: "account",
        purpose: "Access to your Acme account.",
        authorizeHost: "auth.example.com",
        tokenHost: "auth.example.com",
        scopeReasons: ["read your projects", "change your files"],
        accessHosts: ["api.example.com", "files.example.com"],
      });
    });

    it("says the settings are needed when the client ID isn't set", () => {
      expect(signInFacts(acme(), {})).toEqual({
        kind: "settingsNeeded",
        signIns: [{ signIn: "account", purpose: "Access to your Acme account." }],
      });
    });
  });

  describe("trustLine", () => {
    it("names the service, the hosts, the reasons and where the token goes", () => {
      expect(trustLine("Acme", factsOf(acme()))).toBe(
        "Signs in to your Acme account at auth.example.com. Halonic gets the tokens from " +
          "auth.example.com. It can: read your projects; change your files. The sign-in is used " +
          "only with api.example.com and files.example.com.",
      );
    });

    it("leaves out what it can do when the sign-in asks for no scopes", () => {
      expect(trustLine("Acme", { ...facts, scopeReasons: [] })).toBe(
        "Signs in to your Acme account at auth.example.com. Halonic gets the tokens from " +
          "auth.example.com. The sign-in is used only with api.example.com.",
      );
    });
  });

  describe("the token host warning", () => {
    it("shows when the token address is another service", () => {
      const other = factsOf(acme("https://tokens.example.net/token"));
      expect(tokenHostDiffers(other)).toBe(true);
      expect(tokenHostWarning(other)).toBe(
        "The sign-in page and the token address are different services: auth.example.com and " +
          "tokens.example.net. Only continue if you expect that.",
      );
    });

    it("doesn't show for one host, or for Google's known pair", () => {
      expect(tokenHostDiffers(facts)).toBe(false);
      expect(
        tokenHostDiffers({
          ...facts,
          authorizeHost: "accounts.google.com",
          tokenHost: "oauth2.googleapis.com",
        }),
      ).toBe(false);
    });
  });

  describe("outcome lines", () => {
    it("says nothing after a sign-in that got the access it asked for", () => {
      expect(
        outcomeLine("Acme", { kind: "signedIn", missingScopes: [], extraScopes: [] }),
      ).toBeUndefined();
    });

    it("names missing and extra access", () => {
      expect(
        outcomeLine("Acme", { kind: "signedIn", missingScopes: ["write"], extraScopes: ["admin"] }),
      ).toBe(
        "Acme gave a different set of access than you were asked to approve: missing write, extra admin.",
      );
      expect(
        outcomeLine("Acme", { kind: "signedIn", missingScopes: [], extraScopes: ["admin"] }),
      ).toBe("Acme gave a different set of access than you were asked to approve: extra admin.");
    });

    it("says the approved lines for cancel, a refused secret and a provider's error", () => {
      expect(outcomeLine("Acme", { kind: "cancelled" })).toBe("You cancelled the sign-in.");
      expect(outcomeLine("Acme", { kind: "wrongClientSecret" })).toBe(
        "The client secret was refused. Check it in Settings.",
      );
      expect(outcomeLine("Acme", { kind: "providerError", errorCode: "server_error" })).toBe(
        "Acme answered with the error server_error.",
      );
    });

    it("has a line for every way a sign-in can end without a grant", () => {
      expect(outcomeLine("Acme", { kind: "signInChanged" })).toBe(SIGN_IN_CHANGED);
      expect(outcomeLine("Acme", { kind: "unreachable" })).toBe(
        "Couldn't reach Acme. Check your connection and try again.",
      );
      expect(outcomeLine("Acme", { kind: "linkNoLongerValid" })).toBe(
        "The sign-in didn't finish. Try again.",
      );
      expect(outcomeLine("Acme", { kind: "unexpectedAnswer", status: 500 })).toBe(
        "The sign-in didn't finish: Acme's answer couldn't be used.",
      );
    });
  });

  it("says the token may still work when the provider didn't confirm a sign-out", () => {
    expect(signedOutNotConfirmed("Acme")).toBe(
      "You're signed out here. Acme didn't confirm, so the token may still work there until it expires.",
    );
  });
});
