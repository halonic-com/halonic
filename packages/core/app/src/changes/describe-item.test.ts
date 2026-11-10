import { type KindName, type KindValues, parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { describeItemChange } from "./describe-item.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

function parsed<Name extends KindName>(kind: Name, text: string, id: string): KindValues[Name] {
  const result = parseFile(kind, text, { id });
  if (!result.ok) {
    throw new Error(result.error.map((problem) => problem.message).join("; "));
  }
  return result.value.value as KindValues[Name];
}

const agentBefore = lines("id: finance", "name: Finance", "model: claude");
const agentAfter = lines("id: finance", "name: Finance", "model: gpt");

const routineBefore = lines(
  "id: morning-report",
  "name: Morning report",
  "trigger: { every: 1d }",
  "run: { workflow: report }",
);

const workflowBefore = lines(
  "id: report",
  "name: Report",
  "initial: done",
  "states:",
  "  done:",
  "    type: final",
);

const hubBefore = lines("id: finance", "name: Finance");
const hubAfter = lines("id: finance", "name: Finance team");

verifies("app.change-parts-cut", () => {
  it("gives every line of a workflow, an agent or a routine a part", () => {
    const changes = [
      describeItemChange(
        "agent",
        parsed("agent", agentBefore, "finance"),
        parsed("agent", agentAfter, "finance"),
      ),
      describeItemChange(
        "routine",
        parsed("routine", routineBefore, "morning-report"),
        parsed("routine", routineBefore.replace("every: 1d", "every: 1h"), "morning-report"),
      ),
      describeItemChange(
        "workflow",
        parsed("workflow", workflowBefore, "report"),
        parsed("workflow", workflowBefore.replace("name: Report", "name: Reports"), "report"),
      ),
    ];
    for (const changeLines of changes) {
      expect(changeLines).not.toEqual([]);
      for (const line of changeLines) {
        expect(line.parts.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives any other kind one line without parts", () => {
    const hub = (text: string) => parsed("hub", text, "finance");
    expect(describeItemChange("hub", hub(hubBefore), hub(hubAfter))).toEqual([
      { id: "item", sentence: "Changed", parts: [] },
    ]);
    expect(describeItemChange("hub", undefined, hub(hubAfter))).toEqual([
      { id: "item", sentence: "New", parts: [] },
    ]);
    expect(describeItemChange("hub", hub(hubBefore), undefined)).toEqual([
      { id: "item", sentence: "Deleted", parts: [] },
    ]);
  });

  it("gives no lines when an item of another kind didn't change", () => {
    const hub = parsed("hub", hubBefore, "finance");
    expect(describeItemChange("hub", hub, hub)).toEqual([]);
  });
});
