import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { shownRun } from "./run-strip.ts";

const run = (state: string | null, statesVisited: string[]) =>
  ({ summary: { approvals: [], state, statesVisited } }) as never;
const row = (standing: string) => ({ id: "r1", shortId: "r1", standing }) as never;

verifies("workflows.canvas.arrows", () => {
  it("counts the steps a running run has left, not the one it is in", () => {
    const shown = shownRun(row("running"), run("write", ["start", "write"]), undefined);
    expect([...shown.finishedSteps]).toEqual(["start"]);
  });

  it("counts every step of a run that is done", () => {
    const shown = shownRun(row("done"), run(null, ["start", "write", "done"]), undefined);
    expect([...shown.finishedSteps]).toEqual(["start", "write", "done"]);
  });
});
