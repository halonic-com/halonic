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
