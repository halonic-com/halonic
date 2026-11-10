import { parseFile, type Workflow, type WorkflowState } from "@halonicjs/format";
import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { joinLinesThatNeedEachOther } from "./change-needs.ts";
import { describeWorkflowChange } from "./describe-workflow.ts";
import { revertParts } from "./revert-parts.ts";

const lines = (...all: string[]) => `${all.join("\n")}\n`;

function workflow(text: string): Workflow {
  const parsed = parseFile("workflow", text, { id: "support-triage" });
  if (!parsed.ok) {
    throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  }
  return parsed.value.value;
}

const lastVersion = lines(
  "id: support-triage",
  "name: Support",
  "initial: classify",
  "states:",
  "  classify:",
  "    agent: sorter",
  "    output: category",
  "    on: [{ to: notify }]",
  "  notify:",
  "    agent: writer",
  '    input: "Tell the customer: {{context.category}}"',
  "    on: [{ to: done }]",
  "  done:",
  "    type: final",
);

const withPageOncall = lines(
  "id: support-triage",
  "name: Support",
  "initial: classify",
  "states:",
  "  classify:",
  "    agent: sorter",
  "    output: category",
  "    on: [{ to: page-oncall }]",
  "  page-oncall:",
  "    agent: pager",
  "    output: pagedWho",
  "    on: [{ to: notify }]",
  "  notify:",
  "    agent: writer",
  '    input: "Tell the customer: {{context.category}}, paged {{context.pagedWho}}"',
  "    on: [{ to: done }]",
  "  done:",
  "    type: final",
);

const withEscalate = lastVersion.replace(
  "    on: [{ to: notify }]",
  "    on: [{ to: notify }, { to: escalate, event: urgent }]\n  escalate:\n    type: final",
);

function described(before: string, after: string) {
  return describeWorkflowChange(workflow(before), workflow(after));
}

verifies("app.change-line-parts", () => {
  it("gives an added step one line that covers its key", () => {
    const added = described(lastVersion, withPageOncall).find(
      (line) => line.id === "step:page-oncall",
    );
    expect(added).toMatchObject({
      sentence: "Step added: Page oncall",
      parts: [["states", "page-oncall"]],
    });
  });

  it("keeps a step's path when another step is removed", () => {
    const withoutClassify = withPageOncall
      .replace("initial: classify", "initial: page-oncall")
      .replace(/ {2}classify:\n(?: {4}.*\n)+/, "");
    const added = described(lastVersion, withoutClassify).find((line) =>
      line.sentence.includes("Step added: Page oncall"),
    );
    expect(added?.parts).toContainEqual(["states", "page-oncall"]);
  });

  it("covers a step's place on the canvas with the step", () => {
    const placed = `${withPageOncall}layout:\n  page-oncall: { x: 10, y: 20 }\n`;
    const added = described(lastVersion, placed).find((line) => line.id === "step:page-oncall");
    expect(added?.parts).toEqual([
      ["states", "page-oncall"],
      ["layout", "page-oncall"],
    ]);
  });

  it("gives the workflow's fields their own lines", () => {
    const renamed = lastVersion.replace("name: Support", "name: Support triage");
    expect(described(lastVersion, renamed)).toEqual([
      { id: "field:name", sentence: "Name: Support → Support triage", parts: [["name"]] },
    ]);
  });

  it("names a changed step's fields", () => {
    const changed = lastVersion.replace("agent: writer", "agent: replier");
    expect(described(lastVersion, changed)).toEqual([
      {
        id: "step:notify",
        sentence: "Step changed: Notify (agent)",
        parts: [["states", "notify"]],
      },
    ]);
  });

  it("takes out exactly one line when that line's parts are reverted", () => {
    const before = `${withEscalate}layout:\n  escalate: { x: 5, y: 6 }\n`;
    const after = `${withPageOncall.replace("name: Support", "name: Support triage")}layout:\n  page-oncall: { x: 1, y: 2 }\n`;
    const all = described(before, after);
    expect(all.map((line) => line.id)).toContain("step:escalate");
    expect(all.find((line) => line.id === "step:escalate")?.parts).toContainEqual([
      "layout",
      "escalate",
    ]);
    for (const line of all) {
      const undone = unwrap(revertParts(after, before, line.parts));
      const left = described(before, undone).map((other) => other.id);
      expect(left).toEqual(all.filter((other) => other.id !== line.id).map((other) => other.id));
    }
  });

  it("gives a new or deleted workflow one line without parts", () => {
    expect(describeWorkflowChange(undefined, workflow(lastVersion))).toEqual([
      { id: "item", sentence: "New", parts: [] },
    ]);
    expect(describeWorkflowChange(workflow(lastVersion), undefined)).toEqual([
      { id: "item", sentence: "Deleted", parts: [] },
    ]);
  });

  it("gives a field the tables don't name a line under its key", () => {
    const was = workflow(lastVersion);
    const step = was.states["notify"] as WorkflowState;
    const is = {
      ...was,
      owner: "support",
      states: { ...was.states, notify: { ...step, retries: 2 } },
    } as Workflow;
    expect(describeWorkflowChange(was, is)).toEqual([
      { id: "field:owner", sentence: "owner added", parts: [["owner"]] },
      {
        id: "step:notify",
        sentence: "Step changed: Notify (retries)",
        parts: [["states", "notify"]],
      },
    ]);
  });

  it("gives no lines when nothing changed", () => {
    expect(described(lastVersion, lastVersion)).toEqual([]);
  });
});

verifies("app.change-line-needs", () => {
  it("makes a step that reads an added step's output need that step", () => {
    const notify = described(lastVersion, withPageOncall).find((line) => line.id === "step:notify");
    expect(notify?.needs).toEqual(["step:page-oncall"]);
  });

  it("makes a step that goes to an added step need that step", () => {
    const classify = described(lastVersion, withPageOncall).find(
      (line) => line.id === "step:classify",
    );
    expect(classify?.needs).toEqual(["step:page-oncall"]);
  });

  it("makes a removed step need the change that stopped going to it", () => {
    const all = described(withEscalate, lastVersion);
    expect(all.find((line) => line.id === "step:escalate")).toMatchObject({
      sentence: "Step removed: Escalate",
      needs: ["step:classify"],
    });
    expect(all.find((line) => line.id === "step:classify")?.needs).toBeUndefined();
  });

  it("makes Starts at need the added step it starts at", () => {
    const startsAtPage = lastVersion
      .replace("initial: classify", "initial: page-oncall")
      .replace(
        "states:\n",
        "states:\n  page-oncall:\n    agent: pager\n    on: [{ to: classify }]\n",
      );
    const initial = described(lastVersion, startsAtPage).find(
      (line) => line.id === "field:initial",
    );
    expect(initial).toMatchObject({
      sentence: "Starts at: Classify → Page oncall",
      needs: ["step:page-oncall"],
    });
  });

  it("joins two added steps that go to each other into one line", () => {
    const loop = lastVersion.replace(
      "  done:\n",
      "  ask:\n    type: wait\n    on: [{ to: check }]\n  check:\n    agent: checker\n    on: [{ to: ask }]\n  done:\n",
    );
    const joined = described(lastVersion, loop).filter((line) => line.parts.length > 0);
    expect(joined).toEqual([
      {
        id: "step:ask",
        sentence: "Step added: Ask; Step added: Check",
        parts: [
          ["states", "ask"],
          ["states", "check"],
        ],
      },
    ]);
  });
});

describe("joinLinesThatNeedEachOther", () => {
  it("points needs at the joined line and keeps lines outside the loop apart", () => {
    const joined = joinLinesThatNeedEachOther([
      { id: "a", sentence: "A", parts: [["a"]], needs: ["b"] },
      { id: "b", sentence: "B", parts: [["b"]], needs: ["a"], important: true },
      { id: "c", sentence: "C", parts: [["c"]], needs: ["b"] },
    ]);
    expect(joined).toEqual([
      { id: "a", sentence: "A; B", important: true, parts: [["a"], ["b"]] },
      { id: "c", sentence: "C", parts: [["c"]], needs: ["a"] },
    ]);
  });
});
