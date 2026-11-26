import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { findCredentialShape } from "./credential-shape.ts";

/*
 * Every value is made up and built at run time, so the source holds no text
 * shaped like a key and the leak guard stays quiet.
 */
const random = "Q7x2Lm9K";

/** A made-up JWT: base64url JSON header and payload, and a random-looking tail. */
const jwt = `eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJhZ2VudC0xIn0.${"Zm9vYmFy".repeat(4)}`;

/** One made-up value per kind beyond Studio's, as the leak guard knows them. */
const samples: Record<string, string> = {
  "private-key": `-----BEGIN RSA ${"PRIVATE"} KEY-----`,
  "aws-access-key": `AKIA${"Q7X2LM9K".repeat(2)}`,
  "aws-secret-key": `aws_secret_access_key = ${random.repeat(5)}`,
  "github-token": `ghs_${random.repeat(5)}`,
  "npm-token": `npm_${random.repeat(4)}${"Ab3d"}`,
  "slack-token": `xoxp-${random.repeat(2)}`,
  "stripe-key": `sk_live_${random.repeat(3)}`,
  jwt,
  "gitlab-token": `glpat-${random.repeat(3)}`,
  "huggingface-token": `hf_${random.repeat(5)}`,
  "url-password": ["https://deploy:", random, "@example.com/repo"].join(""),
  "npm-auth-token": `//registry.npmjs.org/:_authToken=${random.repeat(3)}`,
  "oauth-field": `refresh_token=${random.repeat(3)}`,
  "oauth-code": `https://example.com/callback?code=${random.repeat(3)}`,
};

verifies("paperclip.front-bot-grounding", () => {
  describe("each kind the leak guard knows counts as a key", () => {
    for (const [kind, sample] of Object.entries(samples)) {
      test(kind, () => {
        expect(findCredentialShape(`see ${sample} here`)).toBe(kind);
      });
    }
  });

  test("GitHub's installation, OAuth, user and refresh tokens count as keys", () => {
    for (const prefix of ["ghs_", "gho_", "ghu_", "ghr_"]) {
      expect(findCredentialShape(`token ${prefix}${random.repeat(3)}`)).toBe("github-token");
    }
  });

  test("a sign-in code counts in a token request, and the word code alone doesn't", () => {
    expect(findCredentialShape(`grant_type=authorization_code&code=${random.repeat(3)}`)).toBe(
      "oauth-code",
    );
    expect(findCredentialShape(`code: ${random.repeat(3)}`)).toBe(undefined);
  });

  test("a long earlier comment that names grant_type is checked quickly", () => {
    // Every earlier comment in a chat goes through this check, not only the
    // short reply. Without the per-line gate and the value's end, this took seconds.
    const codes = `${"code=".repeat(800)}${random.repeat(3)}`;
    const comments = [`grant_type\n${codes}`, `${codes} grant_typ`, `${codes}\ngrant_type`];
    for (const comment of comments) {
      const start = performance.now();
      findCredentialShape(comment);
      expect(performance.now() - start).toBeLessThan(500);
    }
  });

  test("Studio's shapes still count, and ordinary words don't", () => {
    expect(findCredentialShape(`sk-ant-api03-${random.repeat(4)}`)).toBe("ai-provider-key");
    expect(findCredentialShape("Is #6129 merged yet? See eyJ docs and the ghs_ prefix.")).toBe(
      undefined,
    );
  });
});
