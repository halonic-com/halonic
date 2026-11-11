import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { inheritedSecrets } from "./inherited-secrets.ts";

verifies("mcp.stdio-inherited-secrets", () => {
  describe("finding the secrets a program inherits", () => {
    it("takes the value of each variable whose name holds a secret word, whatever its shape", () => {
      const env = {
        ACME_API_KEY: "plain-words-only",
        NODE_AUTH_TOKEN: "acme-node-token",
        npm_config__authToken: "acme-npm-token",
        "acme-password": "acme-password-value",
        acme_client_secret: "acme-client-secret",
      };
      expect(inheritedSecrets(env)).toEqual([
        "plain-words-only",
        "acme-node-token",
        "acme-npm-token",
        "acme-password-value",
        "acme-client-secret",
      ]);
    });

    it("takes the password of a value written as a URL, decoded", () => {
      const env = {
        NOTES_DB: "postgres://acme:o%20k@db.acme.test/notes",
        BROKEN: "https://acme:50%zz@proxy.acme.test",
        PROXY_URL: "https://acme@proxy.acme.test",
      };
      expect(inheritedSecrets(env)).toEqual(["o k", "50%zz"]);
    });

    it("leaves other variables, words that only start like a secret word, and short flags", () => {
      const env = {
        PATH: "/usr/bin",
        KEYMAP: "acme-layout",
        AUTHOR: "acme-writer",
        ACME_TOKEN_CACHE_OFF: "1",
        ACME_SECRET_HIDDEN: "yes",
        UNSET_TOKEN: undefined,
      };
      expect(inheritedSecrets(env)).toEqual([]);
    });
  });
});
