import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** The `integration.yaml` example in the guide, so the guide can't drift from the schema. */
function guideExample(): string {
  const guide = readFileSync(
    join(import.meta.dirname, "../../../../../../docs/guides/integrations.md"),
    "utf8",
  );
  const found = /## The permission sheet[\s\S]*?```yaml\n([\s\S]*?)```/.exec(guide);
  if (found?.[1] === undefined) {
    expect.fail("the guide has no integration.yaml example");
  }
  return found[1];
}

/**
 * Sheets from halonic-com/integrations, copied as they are: the Google ones
 * at ac597f7, the others at 2eda45e.
 */
function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", `${name}.yaml`), "utf8");
}

/** A small valid sheet; each refusal test breaks one line of it. */
const base = [
  "id: weather",
  "version: 1.0.0",
  "kit: 1",
  "provides: [connector]",
  "hosts: [api.example.com]",
];

verifies("format.integration-file", () => {
  it("reads the weather example in the guide", () => {
    const sheet = parsedValue("integration", guideExample());
    expect(sheet.secrets).toEqual({
      "weather-key": {
        purpose: "API key for the forecast service",
        hosts: ["api.example.com"],
        as: "header",
        header: "x-api-key",
        optional: false,
      },
    });
    expect(sheet.tools).toEqual([
      {
        name: "forecast",
        description: "Today's forecast for a city.",
        risk: "read",
        untrusted: true,
      },
    ]);
    expect(sheet.limits).toEqual({ timeoutMs: 600000, maxResponseBytes: 10485760 });
  });

  it.each(["knowledge-mcp", "model-gemini", "tool-google-drive"])(
    "reads the %s sheet from the integrations repo",
    (name) => {
      const parsed = parseFile("integration", fixture(name));
      expect(parsed.ok && parsed.value.warnings).toEqual([]);
    },
  );

  it("reads a host from a setting and an optional secret for it", () => {
    const sheet = parsedValue("integration", fixture("knowledge-mcp"));
    expect(sheet.hosts).toEqual([{ fromSetting: "url" }]);
    expect(sheet.secrets["mcp-server-key"]).toMatchObject({
      hosts: [{ fromSetting: "url" }],
      as: "bearer",
      optional: true,
    });
  });

  it("fills in empty secrets, tokens, tools and needs", () => {
    const sheet = parsedValue("integration", yaml(...base));
    expect(sheet).toEqual({
      id: "weather",
      version: "1.0.0",
      kit: 1,
      provides: ["connector"],
      hosts: ["api.example.com"],
      secrets: {},
      tokens: [],
      tools: [],
      needs: [],
    });
    const recording = parsedValue("integration", yaml(...base, "recording: {}"));
    expect(recording.recording).toEqual({ allowContentTypes: [] });
  });

  it.each([
    ["id: Weather", "id invalid_format 1"],
    ["version: '1.0'", "version invalid_format 2"],
    ["kit: 0", "kit too_small 3"],
    ["provides: []", "provides too_small 4"],
    ["provides: [tools]", "provides.0 invalid_value 4"],
    ["hosts: ['https://api.example.com']", "hosts.0 invalid_format 5"],
    ["hosts: ['*.example.com']", "hosts.0 invalid_format 5"],
    ["hosts: [API.example.com]", "hosts.0 invalid_format 5"],
    ["hosts: [192.168.1.5]", "hosts.0 invalid_format 5"],
    ["hosts: [localhost]", "hosts.0 invalid_format 5"],
    ["hosts: ['api.example.com:70000']", "hosts.0 invalid_format 5"],
    ["hosts: [{ fromSetting: url, port: 1 }]", "hosts.0 unrecognized_keys 5"],
  ])("refuses %s in its place", (line, expected) => {
    const key = line.slice(0, line.indexOf(":"));
    const text = yaml(...base.map((kept) => (kept.startsWith(`${key}:`) ? line : kept)));
    expect(summary(problemsOf("integration", text))).toEqual([expected]);
  });

  it("allows a port on a fixed host", () => {
    const sheet = parsedValue(
      "integration",
      yaml(...base.slice(0, 4), "hosts: [api.example.com:8443]"),
    );
    expect(sheet.hosts).toEqual(["api.example.com:8443"]);
  });

  it.each([
    [
      ["  Weather-Key:", "    purpose: key", "    hosts: [api.example.com]", "    as: bearer"],
      "secrets.Weather-Key invalid_key 8",
    ],
    [
      ["  weather-key:", "    hosts: [api.example.com]", "    as: bearer"],
      "secrets.weather-key.purpose invalid_type 8",
    ],
    [
      ["  weather-key:", "    purpose: key", "    hosts: []", "    as: bearer"],
      "secrets.weather-key.hosts too_small 9",
    ],
    [
      ["  weather-key:", "    purpose: key", "    hosts: [api.example.com]", "    as: query"],
      "secrets.weather-key.as invalid_union 10",
    ],
    [
      ["  weather-key:", "    purpose: key", "    hosts: [api.example.com]", "    as: header"],
      "secrets.weather-key.header invalid_type 8",
    ],
    [
      [
        "  weather-key:",
        "    purpose: key",
        "    hosts: [api.example.com]",
        "    as: bearer",
        "    header: x-key",
      ],
      "secrets.weather-key unrecognized_keys 8",
    ],
    [
      ["  weather-key:", "    purpose: key", "    hosts: [api.example.com]", "    as: form"],
      "secrets.weather-key.field invalid_type 8",
    ],
  ])("refuses a broken secret: %j", (lines, expected) => {
    const text = yaml(...base, "secrets:", ...lines);
    expect(summary(problemsOf("integration", text))).toEqual([expected]);
  });

  it("refuses a secret sent to a host the sheet doesn't declare", () => {
    const text = yaml(
      ...base,
      "secrets:",
      "  weather-key:",
      "    purpose: key",
      "    hosts: [api.example.com, files.example.com, { fromSetting: url }]",
      "    as: bearer",
    );
    const problems = problemsOf("integration", text);
    expect(summary(problems)).toEqual([
      "secrets.weather-key.hosts.1 secret-host-not-declared 9",
      "secrets.weather-key.hosts.2 secret-host-not-declared 9",
    ]);
    expect(problems[0]?.message).toBe(
      `Integration "weather": secret "weather-key" may only go to hosts in hosts, and files.example.com isn't one`,
    );
  });

  it("refuses a tool without a risk or without saying whether it's untrusted", () => {
    const text = yaml(
      ...base,
      "tools:",
      "  - { name: forecast, description: Forecast., untrusted: true }",
      "  - { name: alerts, description: Alerts., risk: read }",
      "  - { name: radar, description: Radar., risk: delete, untrusted: false }",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "tools.0.risk invalid_value 7",
      "tools.1.untrusted invalid_type 8",
      "tools.2.risk invalid_value 9",
    ]);
  });

  it("refuses an empty tool or argument description", () => {
    const text = yaml(
      ...base,
      "tools:",
      "  - name: forecast",
      "    description: ''",
      "    arguments: { city: '' }",
      "    risk: read",
      "    untrusted: false",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "tools.0.description too_small 8",
      "tools.0.arguments.city too_small 9",
    ]);
  });

  it("refuses a token with a bad name and a need it doesn't know", () => {
    const text = yaml(...base, "tokens:", "  - { name: Refresh, purpose: p }", "needs: [network]");
    expect(summary(problemsOf("integration", text))).toEqual([
      "tokens.0.name invalid_format 7",
      "needs.0 invalid_value 8",
    ]);
  });

  it("refuses a thing listed twice, at the second one", () => {
    const text = yaml(
      "id: weather",
      "version: 1.0.0",
      "kit: 1",
      "provides: [connector, connector]",
      "hosts: [api.example.com, { fromSetting: url }, { fromSetting: url }]",
      "tokens:",
      "  - { name: refresh, purpose: p }",
      "  - { name: refresh, purpose: p }",
      "tools:",
      "  - { name: forecast, description: d, risk: read, untrusted: true }",
      "  - { name: forecast, description: d, risk: read, untrusted: true }",
      "needs: [process, process]",
      "recording:",
      "  userContent: [request.body, request.body]",
      "  secretFields: [sig, sig]",
      "  allowContentTypes: [text/plain, text/plain]",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "provides.1 duplicate 4",
      "hosts.2 duplicate 5",
      "tokens.1 duplicate 8",
      "tools.1 duplicate 11",
      "needs.1 duplicate 12",
      "recording.userContent.1 duplicate 14",
      "recording.secretFields.1 duplicate 15",
      "recording.allowContentTypes.1 duplicate 16",
    ]);
  });

  it("refuses a limit of 0 or over its cap, so a sheet can't switch one off", () => {
    const text = yaml(
      ...base,
      "limits:",
      "  timeoutMs: 0",
      "  headersTimeoutMs: 3600001",
      "  idleTimeoutMs: 1.5",
      "  maxResponseBytes: 1073741825",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "limits.timeoutMs too_small 7",
      "limits.headersTimeoutMs too_big 8",
      "limits.idleTimeoutMs invalid_type 9",
      "limits.maxResponseBytes too_big 10",
    ]);
    const capped = yaml(
      ...base,
      "limits: { idleTimeoutMs: 3600000, maxResponseBytes: 1073741824 }",
    );
    expect(parsedValue("integration", capped).limits).toEqual({
      idleTimeoutMs: 3600000,
      maxResponseBytes: 1073741824,
    });
  });

  it.each([
    "request.body",
    "response.body[*].data.result.content[*].text",
    "response.body.owners[*].*",
    "response.body.*",
    "response.body.*.name",
    "response.body.data.*.*",
    "response.body.items[0].name",
    "request.query.q",
  ])("takes the recorder path %s", (path) => {
    const sheet = parsedValue(
      "integration",
      yaml(...base, `recording: { userContent: ['${path}'] }`),
    );
    expect(sheet.recording?.userContent).toEqual([path]);
  });

  it.each([
    "body.text",
    "request.bodytext",
    "response.body.items[x]",
    "response.body..text",
    "response.body.a*b",
    "response.body.a b",
    "response.body.*x",
    "response.body.**",
    "request.query.*",
    "request.query.q.more",
    "response.query.q",
  ])("refuses the recorder path %s", (path) => {
    const text = yaml(...base, `recording: { userContent: ['${path}'] }`);
    expect(summary(problemsOf("integration", text))).toEqual([
      "recording.userContent.0 invalid_format 6",
    ]);
  });

  it("refuses a content type that isn't type/subtype", () => {
    const text = yaml(
      ...base,
      "recording: { allowContentTypes: [text, 'text/plain; charset=utf-8'] }",
    );
    expect(summary(problemsOf("integration", text))).toEqual([
      "recording.allowContentTypes.0 invalid_format 6",
      "recording.allowContentTypes.1 invalid_format 6",
    ]);
  });

  it("refuses unknown keys, such as the knowledge section older sheets had", () => {
    const text = yaml(...base, "knowledge:", "  untrusted: true");
    const problems = problemsOf("integration", text);
    expect(summary(problems)).toEqual([" unrecognized_keys 1"]);
    expect(problems[0]?.keys).toEqual(["knowledge"]);
  });
});
