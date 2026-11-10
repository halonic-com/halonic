import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type KindName, parseFile } from "../index.ts";
import { problemsOf, summary, yaml } from "../test/parse.spec.ts";

// Fake key bodies, built while the test runs, so this file holds no
// secret-shaped text for the leak guard or `gitleaks` to find.
const alphabet = "Q7x2Lm9Kp4Rt8Vw3Zc6Nb5Hj1Fd0GsYa";

function run(characters: string, length: number): string {
  return characters.repeat(Math.ceil(length / characters.length)).slice(0, length);
}

const anthropicKey = `sk-ant-api03-${run(alphabet, 40)}AA`;
const githubToken = `ghp_${run(alphabet, 36)}`;
const hexToken = run("0123456789abcdef", 40);
const awsKeyId = `AKIA${run(alphabet, 16).toUpperCase()}`;

/** Each problem as "path code", and every message, for one file. */
function checked(kind: KindName, text: string): { found: string[]; messages: string[] } {
  const parsed = parseFile(kind, text);
  const problems = parsed.ok ? [] : parsed.error;
  return {
    found: problems.map(({ path, code }) => `${path.join(".")} ${code}`),
    messages: problems.map(({ message }) => message),
  };
}

function httpConnector(...headers: string[]): string {
  return yaml(
    "id: tracker",
    "transport:",
    "  http:",
    "    url: https://tracker.example.com/mcp",
    "    headers:",
    ...headers.map((header) => `      ${header}`),
  );
}

function stdioConnector(...lines: string[]): string {
  return yaml(
    "id: files",
    "transport:",
    "  stdio:",
    "    command: mcp",
    ...lines.map((line) => `    ${line}`),
  );
}

verifies("format.keys-in-values", () => {
  describe("in a connector's headers", () => {
    it("refuses a bearer key, at its line, pointing to the secret", () => {
      const text = httpConnector(`Authorization: Bearer ${anthropicKey}`);
      expect(summary(problemsOf("connector", text))).toEqual([
        "transport.http.headers.Authorization value-looks-like-key 6",
      ]);
      const { messages } = checked("connector", text);
      expect(messages[0]).toContain("connector's secret");
      expect(messages[0]).not.toContain(anthropicKey.slice(4, 20));
    });

    it("refuses a key without a known format under a credential header", () => {
      expect(checked("connector", httpConnector(`X-Api-Key: '${hexToken}'`)).found).toEqual([
        "transport.http.headers.X-Api-Key value-looks-like-key",
      ]);
    });

    it("passes ordinary headers, even a long hex one under another name", () => {
      const text = httpConnector("Accept: application/json", `X-Trace: '${hexToken}'`);
      expect(parseFile("connector", text).ok).toBe(true);
    });
  });

  describe("in a local program's env and args", () => {
    it("refuses a token in env, pointing to secretEnv", () => {
      const text = stdioConnector("env:", `  GITHUB_TOKEN: ${githubToken}`, "  LOG_LEVEL: debug");
      expect(summary(problemsOf("connector", text))).toEqual([
        "transport.stdio.env.GITHUB_TOKEN value-looks-like-key 6",
      ]);
      expect(checked("connector", text).messages[0]).toContain("secretEnv");
    });

    it.each([
      ["an address", "AUTH_URL: https://login.example.com/oauth2/v2.0/authorize"],
      ["a path", "PYTHONPATH: /opt/python3.12-tools"],
      [
        "a path without a dot under a credential name",
        "CREDENTIALS_DIR: /srv/runner/work/app2/creds",
      ],
    ])("passes %s", (_name, line) => {
      expect(parseFile("connector", stdioConnector("env:", `  ${line}`)).ok).toBe(true);
    });

    it("refuses a key in an argument, after a flag or with one, at its index", () => {
      const text = stdioConnector(
        "args:",
        `  - --api-key=${hexToken}`,
        "  - --token",
        `  - '${hexToken}'`,
        `  - ${anthropicKey}`,
        "  - --rev",
        `  - '${hexToken}'`,
      );
      expect(checked("connector", text).found).toEqual([
        "transport.stdio.args.0 value-looks-like-key",
        "transport.stdio.args.2 value-looks-like-key",
        "transport.stdio.args.3 value-looks-like-key",
      ]);
      expect(checked("connector", text).messages[0]).toContain("secretEnv");
    });

    it("passes a path after a credential flag", () => {
      const text = stdioConnector("args:", "  - --token-file", "  - /var/lib/halonic2/tokens");
      expect(parseFile("connector", text).ok).toBe(true);
    });
  });

  describe("in options and config", () => {
    it("refuses a key in a provider option, pointing to the provider's secret", () => {
      const text = yaml(
        "id: openai",
        "type: openai",
        "options:",
        "  headers:",
        `    authorization: Bearer ${anthropicKey}`,
      );
      expect(summary(problemsOf("provider", text))).toEqual([
        "options.headers.authorization value-looks-like-key 5",
      ]);
      expect(checked("provider", text).messages[0]).toContain("provider's secret");
    });

    it("refuses a key in a runtime option and in a knowledge setting", () => {
      const runtime = yaml("id: edge", "type: cloudflare", "options:", `  apiToken: ${awsKeyId}`);
      expect(checked("runtime", runtime).found).toEqual(["options.apiToken value-looks-like-key"]);

      const knowledge = yaml(
        "id: notes",
        "provider: mcp",
        "config:",
        `  servers: [${anthropicKey}]`,
      );
      expect(checked("knowledge", knowledge).found).toEqual([
        "config.servers.0 value-looks-like-key",
      ]);
    });

    it("passes ordinary settings", () => {
      const runtime = yaml(
        "id: edge",
        "type: cloudflare",
        "options: { accountId: acme, port: 8787 }",
      );
      expect(parseFile("runtime", runtime).ok).toBe(true);
    });
  });
});
