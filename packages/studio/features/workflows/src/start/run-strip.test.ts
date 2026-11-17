import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { marksOf, shownRun } from "./run-strip.ts";

const run = (state: string | null, statesVisited: string[]) =>
  ({ summary: { approvals: [], state, statesVisited } }) as never;
const row = (standing: string) => ({ id: "r1", shortId: "r1", standing }) as never;

verifies("workflows.canvas.arrows", () => {
  it("hands the canvas the steps the run went through, in order", () => {
    const shown = shownRun(row("running"), run("write", ["start", "write"]), undefined);
    expect(shown.route).toEqual(["start", "write"]);
  });
});

verifies("workflows.canvas.status-dots", () => {
  it("marks the steps before the last done and the last by how the run stands", () => {
    expect(marksOf(["start", "write"], "running")).toEqual({ start: "done", write: "running" });
    expect(marksOf(["start", "write"], "needs-you")["write"]).toBe("waiting");
    expect(marksOf(["start", "write"], "failed")["write"]).toBe("failed");
    expect(marksOf(["start", "write"], "done")["write"]).toBe("done");
    expect(marksOf(["start", "write"], "cancelled")["write"]).toBe("stopped");
  });

  it("names the active step only while the run is going", () => {
    const visited = ["start", "write"];
    expect(shownRun(row("running"), run("write", visited), undefined).active).toBe("write");
    expect(shownRun(row("waiting"), run("write", visited), undefined).active).toBe("write");
    expect(shownRun(row("done"), run("write", visited), undefined).active).toBeUndefined();
    expect(shownRun(row("failed"), run("write", visited), undefined).active).toBeUndefined();
  });
});
