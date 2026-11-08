import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.hub-file", () => {
  it("fills in defaults and models, and leaves uses out when the file does", () => {
    expect(parsedValue("hub", yaml("id: billing", "name: Billing"))).toEqual({
      version: 1,
      id: "billing",
      name: "Billing",
      defaults: {},
      models: {},
    });
  });

  it("fills in every list of uses once uses is there", () => {
    const value = parsedValue(
      "hub",
      yaml("id: billing", "name: Billing", "uses:", "  skills: [plain-words]"),
    );
    expect(value.uses).toEqual({
      connectors: [],
      skills: ["plain-words"],
      knowledge: [],
      collections: [],
    });
  });

  it("checks a hub-level alias like a workspace alias", () => {
    const text = yaml(
      "id: billing",
      "name: Billing",
      "models:",
      "  careful:",
      "    provider: mock",
      "    model: deep",
      "    params: { temperature: hot }",
    );
    expect(summary(problemsOf("hub", text))).toEqual([
      "models.careful.params.temperature invalid_type 7",
    ]);
  });

  it("refuses an id in uses that isn't an id", () => {
    const text = yaml("id: billing", "name: Billing", "uses:", "  connectors: [Mailbox]");
    expect(summary(problemsOf("hub", text))).toEqual(["uses.connectors.0 invalid_format 4"]);
  });
});
