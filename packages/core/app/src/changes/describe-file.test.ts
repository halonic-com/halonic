import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { describeFileChange } from "./describe-file.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

const agentPath = "agents/triage.agent.yaml";
const agentBefore = lines(
  "id: triage",
  "name: Triage",
  "model: claude",
  "instructions: Sort mail.",
);

verifies("app.change-file-lines", () => {
  it("lists the important lines first, each with its part", () => {
    const after = lines("id: triage", "name: Triage", "model: gpt", "instructions: Sort all mail.");
    const change = describeFileChange(agentPath, agentBefore, after);
    expect(change).toMatchObject({ kind: "agent", described: true });
    expect(change.lines.map((line) => line.important === true)).toEqual([true, false]);
    expect(change.lines.map((line) => line.parts)).toEqual([[["instructions"]], [["model"]]]);
  });

  it("carries the item's name, from the new text or else the deleted one", () => {
    const after = lines("id: triage", "name: Sorter", "model: gpt", "instructions: Sort mail.");
    expect(describeFileChange(agentPath, agentBefore, after).name).toBe("Sorter");
    expect(describeFileChange(agentPath, agentBefore, null).name).toBe("Triage");
    expect(describeFileChange("README.md", "a\n", "b\n").name).toBeUndefined();
  });

  it("gives one line without parts for a file no kind places", () => {
    expect(describeFileChange("README.md", "a\n", "b\n")).toEqual({
      path: "README.md",
      kind: undefined,
      lines: [{ id: "item", sentence: "Changed", parts: [] }],
      described: false,
    });
  });

  it("gives one Changed line when a text doesn't read as the kind", () => {
    const change = describeFileChange(agentPath, agentBefore, "model: [unclosed\n");
    expect(change).toMatchObject({ kind: "agent", described: false });
    expect(change.lines).toEqual([{ id: "item", sentence: "Changed", parts: [] }]);
  });

  it("gives one Changed line when only comments changed", () => {
    const change = describeFileChange(agentPath, agentBefore, `# note\n${agentBefore}`);
    expect(change.described).toBe(false);
    expect(change.lines).toEqual([{ id: "item", sentence: "Changed", parts: [] }]);
  });

  it("says New and Deleted for a file that is new or gone", () => {
    expect(describeFileChange(agentPath, null, agentBefore).lines[0]?.sentence).toBe("New");
    expect(describeFileChange(agentPath, agentBefore, null).lines[0]?.sentence).toBe("Deleted");
    expect(describeFileChange("notes.txt", null, "x").lines[0]?.sentence).toBe("New");
  });
});
