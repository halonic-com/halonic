import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** A workflow whose one agent step sends `signal`, then ends; `step` replaces that step. */
function workflowSending(signal: string, step = "    agent: writer") {
  return [
    "name: Thank",
    "initial: write",
    "states:",
    "  write:",
    step,
    `    signal: { name: ${signal} }`,
    "    on: [{ to: done }]",
    "  done: { type: final }",
    "",
  ].join("\n");
}

/** The `routine-starts-itself` issues of a workspace with a routine on `paid` that runs `thank`. */
async function loopIssues(files: Record<string, string>, when = "") {
  const workspace = await loadWorkspace(
    new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "agents/writer.agent.yaml": "name: Writer\n",
      "workflows/routines/on-paid.routine.yaml": [
        "name: On paid",
        `trigger: { signal: { name: paid${when} } }`,
        "run: { workflow: thank }",
        "",
      ].join("\n"),
      ...files,
    }),
  );
  return workspace.issues.filter((issue) => issue.code === "routine-starts-itself");
}

verifies("workspace.routine-signal-loops", () => {
  it("warns at the trigger's signal when the routine's workflow sends that signal", async () => {
    const issues = await loopIssues({ "workflows/thank.workflow.yaml": workflowSending("paid") });
    expect(issues.map((issue) => [issue.severity, issue.path.join("."), issue.message])).toEqual([
      [
        "warning",
        "trigger.signal.name",
        'Routine "on-paid": workflow "thank" sends signal "paid", which starts this routine again. Add a "when" that stops the loop.',
      ],
    ]);
  });

  it("warns when a child workflow sends the signal", async () => {
    const issues = await loopIssues({
      "workflows/thank.workflow.yaml": workflowSending(
        "done",
        "    type: workflow\n    workflow: note",
      ),
      "workflows/note.workflow.yaml": workflowSending("paid"),
    });
    expect(issues).toHaveLength(1);
  });

  it("says nothing with a `when`, or when the workflow sends other signals", async () => {
    const sends = (signal: string) => ({
      "workflows/thank.workflow.yaml": workflowSending(signal),
    });
    expect(
      await loopIssues(sends("paid"), ", when: { exists: '{{trigger.signal.first}}' }"),
    ).toEqual([]);
    expect(await loopIssues(sends("thanked"))).toEqual([]);
  });
});
