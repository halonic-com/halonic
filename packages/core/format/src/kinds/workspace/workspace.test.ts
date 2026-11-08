import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

describe("format.workspace-file", () => {
  it("fills in version, privacy and defaults for a minimal file", () => {
    expect(parsedValue("workspace", yaml("id: acme", "name: Acme"))).toEqual({
      version: 1,
      id: "acme",
      name: "Acme",
      privacy: { localOnly: false },
      defaults: { runtime: "inprocess", model: "default" },
    });
  });

  it("fills in the budget currency and keeps the limits", () => {
    const value = parsedValue(
      "workspace",
      yaml("id: acme", "name: Acme", "budget:", "  perRun: 2"),
    );
    expect(value.budget).toEqual({ currency: "EUR", perRun: 2 });
  });

  it("refuses an id with capitals", () => {
    expect(summary(problemsOf("workspace", yaml("id: Acme", "name: Acme")))).toEqual([
      "id invalid_format 1",
    ]);
  });

  it("refuses a session AI with more than 64 steps", () => {
    const text = yaml("id: acme", "name: Acme", "assistant:", "  maxSteps: 65");
    expect(summary(problemsOf("workspace", text))).toEqual(["assistant.maxSteps too_big 4"]);
  });

  it("refuses a budget that is not positive", () => {
    const text = yaml("id: acme", "name: Acme", "budget:", "  monthly: 0");
    expect(summary(problemsOf("workspace", text))).toEqual(["budget.monthly too_small 4"]);
  });

  it("refuses an unknown character style and an unknown key", () => {
    const text = yaml("id: acme", "name: Acme", "appearance:", "  characters: loud", "colour: red");
    expect(summary(problemsOf("workspace", text))).toEqual([
      "appearance.characters invalid_value 4",
      " unrecognized_keys 1",
    ]);
  });
});
