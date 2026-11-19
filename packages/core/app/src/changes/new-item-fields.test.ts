import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { newItemFields } from "./new-item-fields.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

verifies("app.new-item-fields", () => {
  it("gives a new skill's Name, When to use it and Instructions, as the Library names them", () => {
    const text = lines(
      "---",
      "name: Refund handling",
      "description: Use it for refund questions.",
      "---",
      "Check the order first.",
    );
    expect(newItemFields("hubs/support/library/skills/refunds/SKILL.md", text)).toEqual([
      { key: "name", label: "Name", value: "Refund handling" },
      { key: "description", label: "When to use it", value: "Use it for refund questions." },
      { key: "body", label: "Instructions", value: "Check the order first." },
    ]);
  });

  it("gives a new agent's fields with an edited agent's labels and order, without its id", () => {
    const text = lines("id: triage", "instructions: Sort mail.", "name: Triage", "model: claude");
    const fields = newItemFields("agents/triage.agent.yaml", text);
    expect(fields?.map((field) => field.label)).toEqual(["Name", "Instructions", "Model"]);
  });

  it("names a field no label covers from its key", () => {
    const fields = newItemFields("hubs/support/hub.yaml", lines("name: Support"));
    expect(fields?.[0]).toMatchObject({ key: "name", label: "Name", value: "Support" });
  });

  it("gives nothing for a file no kind places or a text that doesn't read as its kind", () => {
    expect(newItemFields("notes/README.md", "Hello\n")).toBeUndefined();
    expect(newItemFields("agents/triage.agent.yaml", "name: [unclosed\n")).toBeUndefined();
  });
});
