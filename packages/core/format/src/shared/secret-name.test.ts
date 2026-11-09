import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseFile } from "../index.ts";
import { problemsOf, summary, yaml } from "../test/parse.spec.ts";
import { looksLikeKey } from "./secret-name.ts";

// Fake key bodies, built while the test runs, so this file holds no
// secret-shaped text for the leak guard or `gitleaks` to find.
const alphabet = "Q7x2Lm9Kp4Rt8Vw3Zc6Nb5Hj1Fd0GsYa";
const hexDigits = "0123456789abcdef";

/** A run of the given characters, repeated to the given length. */
function run(characters: string, length: number): string {
  return characters.repeat(Math.ceil(length / characters.length)).slice(0, length);
}

/** A varied run of letters and digits of the given length. */
function body(length: number): string {
  return run(alphabet, length);
}

/** A run of hex digits of the given length. */
function hex(length: number): string {
  return run(hexDigits, length);
}

/** A UUID's shape: 8-4-4-4-12 hex digits. */
function uuidShaped(): string {
  return [8, 4, 4, 4, 12].map(hex).join("-");
}

/**
 * Keys as they are pasted. All but the bare UUID are valid secret names by
 * the rule alone; the bare UUID starts with a digit, so without the key test
 * the `secret-name` message would quote it.
 */
const keys: ReadonlyArray<readonly [string, string]> = [
  ["an Anthropic key", `sk-ant-api03-${body(40)}-${body(40)}AA`],
  ["an OpenAI project key", `sk-proj-${body(48)}`],
  ["a Google API key", `AIza${body(35)}`],
  ["a GitHub token", `ghp_${body(36)}`],
  ["a Slack user token", ["xoxp", "1234567890", "1234567890123", body(32).toLowerCase()].join("-")],
  ["a hex token", hex(40)],
  // Exactly 20 characters: it fails if the random-part length goes above 20.
  ["an AWS access key ID", `AKIA${body(16).toUpperCase()}`],
  ["a bare UUID", uuidShaped()],
  ["a UUID after a name, in capitals", `openai-${uuidShaped().toUpperCase()}`],
];

/** The problem codes and messages a provider file with this secret gets. */
function providerProblems(secret: string): Array<{ code: string; message: string }> {
  const parsed = parseFile("provider", yaml("id: openai", "type: openai", `secret: '${secret}'`));
  return parsed.ok ? [] : parsed.error.map(({ code, message }) => ({ code, message }));
}

verifies("format.secret-names", () => {
  describe("looksLikeKey", () => {
    it.each(keys)("finds %s", (_name, key) => {
      expect(looksLikeKey(key)).toBe(true);
    });

    it.each([
      "openai-key",
      "OPENAI_API_KEY",
      "serve-password",
      "google-client-secret",
      "anthropic-2025-production",
      "sk-learn",
      "averyveryverylongsecretnamewithoutdigits",
    ])("leaves the name %s alone", (name) => {
      expect(looksLikeKey(name)).toBe(false);
    });
  });

  describe("in a provider file", () => {
    it("passes a good secret name", () => {
      expect(
        parseFile("provider", yaml("id: openai", "type: openai", "secret: openai-key")).ok,
      ).toBe(true);
    });

    it("refuses a name that breaks the rule, at its line, and repeats it", () => {
      const text = yaml("id: openai", "type: openai", "secret: openai key");
      expect(summary(problemsOf("provider", text))).toEqual(["secret secret-name 3"]);
      expect(providerProblems("openai key")).toEqual([
        {
          code: "secret-name",
          message:
            'The secret name "openai key" can\'t be used. Start with a letter, then use only letters, digits, - or _, such as openai-key.',
        },
      ]);
    });

    it.each(keys)("refuses %s as the name, without repeating it", (_name, key) => {
      const problems = providerProblems(key);
      expect(problems.map(({ code }) => code)).toEqual(["secret-looks-like-key"]);
      expect(problems[0]?.message).not.toContain(key.slice(4, 20));
    });

    it.each([
      ["over 128 characters", `name-${"q".repeat(130)}`, "qqqq"],
      ["with a character that isn't ASCII", "sérve-password", "rve-password"],
      ["with a control character", "serve\u0007password", "password"],
    ])("refuses a name %s, giving only its length", (_name, name, part) => {
      const problems = providerProblems(name);
      expect(problems.map(({ code }) => code)).toEqual(["secret-name"]);
      expect(problems[0]?.message).toContain(`${name.length} characters`);
      expect(problems[0]?.message).not.toContain(part);
    });
  });

  describe("in a connector file", () => {
    it("checks the connector's own secret and every secretEnv value, each at its line", () => {
      const http = yaml(
        "id: tracker",
        "transport: { http: { url: 'https://tracker.example.com' } }",
        "secret: tracker token",
      );
      expect(summary(problemsOf("connector", http))).toEqual(["secret secret-name 3"]);

      const stdio = yaml(
        "id: files",
        "transport:",
        "  stdio:",
        "    command: mcp",
        "    secretEnv:",
        "      FILES_TOKEN: files-token",
        "      OTHER_TOKEN: other token",
        `      PASTED_TOKEN: ${keys[3]?.[1]}`,
      );
      expect(summary(problemsOf("connector", stdio))).toEqual([
        "transport.stdio.secretEnv.OTHER_TOKEN secret-name 7",
        "transport.stdio.secretEnv.PASTED_TOKEN secret-looks-like-key 8",
      ]);
    });

    it("checks a Google connector's refresh-token secret", () => {
      const google = yaml(
        "id: mailbox",
        "transport: { google: { account: desk@example.com } }",
        `secret: ${keys[0]?.[1]}`,
      );
      expect(summary(problemsOf("connector", google))).toEqual(["secret secret-looks-like-key 3"]);
    });
  });
});
