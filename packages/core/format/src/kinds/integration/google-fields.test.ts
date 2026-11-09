import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { readYaml } from "@halonicjs/yaml";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { parseIntegrationSheet } from "./parse-sheet.ts";

/** Sheets from halonic-com/integrations (ac597f7), copied as they are. */
function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", `${name}.yaml`), "utf8");
}

/**
 * A small sheet with the Google sign-in; each test adds or breaks one
 * Google field. The fields start at line 9.
 */
const google = [
  "id: tool-google-ledger",
  "version: 1.0.0",
  "kit: 1",
  "provides: [connector]",
  "hosts: [ledger.googleapis.com, www.googleapis.com]",
  "secrets:",
  "  google-account:",
  "    purpose: Access to the Google account you connect.",
  "    hosts: [ledger.googleapis.com]",
  "    as: bearer",
];

const scopes = [
  "googleScopes:",
  "  - scope: https://www.googleapis.com/auth/ledger.readonly",
  "    reason: Reads your ledger.",
];
const apis = ["googleApis:", "  - { api: ledger.googleapis.com, name: Ledger API }"];

/** A sheet with the Google sign-in, valid scopes and APIs, and these lines. */
function googleSheet(...lines: string[]): string {
  return yaml(...google, ...scopes, ...apis, ...lines);
}

verifies("format.integration-google-fields", () => {
  it("reads the Gmail sheet's Google fields as written", () => {
    const sheet = parsedValue("integration", fixture("tool-google-gmail"));
    expect(sheet.googleScopes).toEqual([
      {
        scope: "https://www.googleapis.com/auth/gmail.modify",
        reason: "Reads, labels, drafts and sends your mail; it can't delete mail for good.",
        restricted: true,
      },
    ]);
    expect(sheet.googleApis).toEqual([{ api: "gmail.googleapis.com", name: "Gmail API" }]);
    expect(sheet.googleCheck).toEqual({
      method: "GET",
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    });
  });

  it.each(["tool-google-gmail", "tool-google-drive"])(
    "reads the %s sheet with parseFile and parseIntegrationSheet",
    (name) => {
      const text = fixture(name);
      const data = readYaml(text);
      expect(data.ok && parseIntegrationSheet(data.value.data).ok).toBe(true);
      const parsed = parsedValue("integration", text);
      expect(parsed.googleCheck?.method).toBe("GET");
    },
  );

  it("takes a sign-in scope without a URL and leaves restricted out", () => {
    const sheet = parsedValue(
      "integration",
      yaml(
        ...google,
        "googleScopes:",
        "  - { scope: email, reason: Shows who is signed in. }",
        ...apis,
      ),
    );
    expect(sheet.googleScopes).toEqual([{ scope: "email", reason: "Shows who is signed in." }]);
  });

  it("takes an API name with a slash, a dot or a comma", () => {
    const text = yaml(
      ...google,
      ...scopes,
      "googleApis:",
      "  - { api: pubsub.googleapis.com, name: Cloud Pub/Sub API }",
      "  - { api: ledger.googleapis.com, name: 'Ledger API v1.2, beta' }",
    );
    expect(parsedValue("integration", text).googleApis?.map((entry) => entry.name)).toEqual([
      "Cloud Pub/Sub API",
      "Ledger API v1.2, beta",
    ]);
  });

  it("refuses scope URL strings, as older sheets had", () => {
    const text = yaml(...google, "googleScopes: [https://www.googleapis.com/auth/drive]", ...apis);
    expect(summary(problemsOf("integration", text))).toEqual(["googleScopes.0 invalid_type 11"]);
  });

  it.each([
    [
      "  - { scope: https://example.com/auth/drive, reason: r }",
      "googleScopes.0.scope invalid_format 12",
    ],
    [
      "  - { scope: https://www.googleapis.com/auth/Drive, reason: r }",
      "googleScopes.0.scope invalid_format 12",
    ],
    ["  - { scope: openid, reason: ' ' }", "googleScopes.0.reason invalid_format 12"],
    ["  - { scope: openid }", "googleScopes.0.reason invalid_type 12"],
    [
      "  - { scope: openid, reason: r, restricted: false }",
      "googleScopes.0.restricted invalid_value 12",
    ],
    ["  - { scope: openid, reason: r, why: w }", "googleScopes.0 unrecognized_keys 12"],
  ])("refuses the scope entry %s", (line, expected) => {
    const text = yaml(...google, "googleScopes:", line, ...apis);
    expect(summary(problemsOf("integration", text))).toEqual([expected]);
  });

  it.each([
    ["  - { api: ledger.example.com, name: Ledger API }", "googleApis.0.api invalid_format 15"],
    ["  - { api: ledger.googleapis.com, name: '' }", "googleApis.0.name invalid_format 15"],
    [
      "  - { api: ledger.googleapis.com, name: ' Ledger API' }",
      "googleApis.0.name invalid_format 15",
    ],
    [
      "  - { api: ledger.googleapis.com, name: 'https://example.com/ledger' }",
      "googleApis.0.name invalid_format 15",
    ],
    [
      `  - { api: ledger.googleapis.com, name: ${"L".repeat(81)} }`,
      "googleApis.0.name invalid_format 15",
    ],
    ["  - { api: ledger.googleapis.com }", "googleApis.0.name invalid_type 15"],
    ["  - { api: ledger.googleapis.com, name: n, id: 1 }", "googleApis.0 unrecognized_keys 15"],
  ])("refuses the API entry %s", (line, expected) => {
    const text = yaml(...google, ...scopes, "googleApis:", line);
    expect(summary(problemsOf("integration", text))).toEqual([expected]);
  });

  it("reads a googleCheck to a host of the sheet and of the google-account secret", () => {
    const url = "https://ledger.googleapis.com/v1/me?fields=user";
    const sheet = parsedValue(
      "integration",
      googleSheet(`googleCheck: { method: GET, url: '${url}' }`),
    );
    expect(sheet.googleCheck).toEqual({ method: "GET", url });
  });

  it.each([
    [
      "{ method: POST, url: 'https://ledger.googleapis.com/v1/me' }",
      "googleCheck.method invalid_value 16",
    ],
    [
      "{ method: GET, url: 'http://ledger.googleapis.com/v1/me' }",
      "googleCheck.url invalid_format 16",
    ],
    [
      "{ method: GET, url: 'https://ledger.googleapis.com:8443/v1/me' }",
      "googleCheck.url invalid_format 16",
    ],
    [
      "{ method: GET, url: 'https://user@ledger.googleapis.com/v1/me' }",
      "googleCheck.url invalid_format 16",
    ],
    [
      "{ method: GET, url: 'https://ledger.googleapis.com/v1/me#top' }",
      "googleCheck.url invalid_format 16",
    ],
    [
      "{ method: GET, url: 'https://LEDGER.googleapis.com/v1/me' }",
      "googleCheck.url invalid_format 16",
    ],
    [
      "{ method: GET, url: 'https://ledger.googleapis.com/v1/me', body: '{}' }",
      "googleCheck unrecognized_keys 16",
    ],
    ["{ url: 'https://ledger.googleapis.com/v1/me' }", "googleCheck.method invalid_value 16"],
  ])("refuses googleCheck: %s", (value, expected) => {
    const text = googleSheet(`googleCheck: ${value}`);
    expect(summary(problemsOf("integration", text))).toEqual([expected]);
  });

  it.each([
    // In the sheet's hosts, but the google-account token may not go there.
    ["https://www.googleapis.com/drive/v3/about", "www.googleapis.com"],
    // In neither.
    ["https://gmail.googleapis.com/gmail/v1/users/me/profile", "gmail.googleapis.com"],
  ])("refuses a googleCheck to %s", (url, host) => {
    const problems = problemsOf(
      "integration",
      googleSheet(`googleCheck: { method: GET, url: '${url}' }`),
    );
    expect(summary(problems)).toEqual(["googleCheck.url google-check-host-not-declared 16"]);
    expect(problems[0]?.message).toContain(` ${host} `);
  });

  it("refuses googleScopes without googleApis", () => {
    const text = yaml(...google, ...scopes);
    expect(summary(problemsOf("integration", text))).toEqual([
      "googleScopes google-apis-missing 12",
    ]);
    const empty = yaml(...google, ...scopes, "googleApis: []");
    expect(summary(problemsOf("integration", empty))).toEqual([
      "googleScopes google-apis-missing 12",
    ]);
  });

  it("refuses the Google fields on a sheet without the google-account secret", () => {
    const text = yaml(
      "id: weather",
      "version: 1.0.0",
      "kit: 1",
      "provides: [connector]",
      "hosts: [api.example.com]",
      ...scopes,
      ...apis,
      "googleCheck: { method: GET, url: 'https://api.example.com/me' }",
    );
    const problems = problemsOf("integration", text);
    expect(summary(problems)).toEqual([
      "googleScopes google-field-without-sign-in 7",
      "googleApis google-field-without-sign-in 10",
      "googleCheck google-field-without-sign-in 11",
    ]);
    expect(problems[0]?.message).toBe(
      `Integration "weather": googleScopes is only for an integration with the google-account secret. Remove it, or add the secret`,
    );
  });

  it("refuses a scope or an API listed twice, at the second one", () => {
    const text = yaml(
      ...google,
      "googleScopes:",
      "  - { scope: openid, reason: Signs you in. }",
      "  - { scope: openid, reason: Signs you in again. }",
      "googleApis:",
      "  - { api: ledger.googleapis.com, name: Ledger API }",
      "  - { api: ledger.googleapis.com, name: Ledger API v2 }",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "googleScopes.1 duplicate 13",
      "googleApis.1 duplicate 16",
    ]);
  });
});
