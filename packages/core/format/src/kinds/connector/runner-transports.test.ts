import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorIsLocal, parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.connector-runner-transports", () => {
  it("reads an integration folder and a plugin id as transports", () => {
    const integration = yaml("id: notes", "transport: { integration: { folder: notes } }");
    expect(parsedValue("connector", integration).transport).toEqual({
      integration: { folder: "notes" },
    });
    const plugin = yaml("id: tracker", "transport: { plugin: { id: acme-tracker } }");
    expect(parsedValue("connector", plugin).transport).toEqual({ plugin: { id: "acme-tracker" } });
  });

  it("reads an integration's settings and its secret picks, by name only", () => {
    const integration = yaml(
      "id: issues",
      "transport:",
      "  integration:",
      "    folder: tool-paperclip-issues",
      "    settings: { url: 'http://localhost:3100', limit: 20, archived: false }",
      "    secrets: { paperclip-key: paperclip-agent-key }",
    );
    expect(parsedValue("connector", integration).transport).toEqual({
      integration: {
        folder: "tool-paperclip-issues",
        settings: { url: "http://localhost:3100", limit: 20, archived: false },
        secrets: { "paperclip-key": "paperclip-agent-key" },
      },
    });
  });

  // Built while the test runs, so this file holds no secret-shaped text.
  const randomPart = "Q7x2Lm9Kp4Rt8Vw3Zc6Nb5Hj1Fd0GsYa".slice(0, 32);

  /** An integration connector with one more setting next to its `url`, on line 5. */
  function withSetting(name: string, value: string): string {
    return yaml(
      "id: issues",
      "transport:",
      "  integration:",
      "    folder: notes",
      `    settings: { url: 'http://localhost:3100', ${name}: '${value}' }`,
    );
  }

  it("refuses a setting that holds a known key format, without repeating it", () => {
    const pasted = `ghp_${randomPart}AbCd`;
    const text = withSetting("endpoint", pasted);
    expect(summary(problemsOf("connector", text))).toEqual([
      "transport.integration.settings.endpoint value-looks-like-key 5",
    ]);
    const parsed = parseFile("connector", text);
    const messages = parsed.ok ? [] : parsed.error.map(({ message }) => message);
    expect(messages.join(" ")).not.toContain(randomPart.slice(0, 16));
  });

  it("refuses a random value under a credential's name, and only there", () => {
    expect(summary(problemsOf("connector", withSetting("apiKey", randomPart)))).toEqual([
      "transport.integration.settings.apiKey value-looks-like-key 5",
    ]);
    const parsed = parseFile("connector", withSetting("label", randomPart));
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
  });

  it("holds an address and a label to no secret-name rule", () => {
    const parsed = parseFile("connector", withSetting("label", "work notes"));
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
  });

  it("refuses a setting that isn't a plain value, and an unknown key", () => {
    const nested = yaml(
      "id: issues",
      "transport: { integration: { folder: notes, settings: { url: { host: x } } } }",
    );
    expect(problemsOf("connector", nested)).not.toEqual([]);
    const unknown = yaml("id: issues", "transport: { integration: { folder: notes, env: {} } }");
    expect(problemsOf("connector", unknown)).not.toEqual([]);
  });

  it("is not local by default, and is when the file says so", () => {
    const integration = yaml("id: notes", "transport: { integration: { folder: notes } }");
    expect(connectorIsLocal(parsedValue("connector", integration))).toBe(false);
    const plugin = yaml(
      "id: tracker",
      "transport: { plugin: { id: acme-tracker } }",
      "local: true",
    );
    expect(connectorIsLocal(parsedValue("connector", plugin))).toBe(true);
  });

  it("refuses an integration together with another transport", () => {
    const both = yaml(
      "id: notes",
      "transport:",
      "  integration: { folder: notes }",
      "  stdio: { command: x }",
    );
    expect(summary(problemsOf("connector", both))).toEqual(["transport invalid_union 3"]);
  });
});
