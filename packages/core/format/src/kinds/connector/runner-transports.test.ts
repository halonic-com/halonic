import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorIsLocal } from "../../index.ts";
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
