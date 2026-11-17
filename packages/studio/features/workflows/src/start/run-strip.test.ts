import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { shownRun } from "./run-strip.ts";

const run = (state: string | null, statesVisited: string[]) =>
  ({ summary: { approvals: [], state, statesVisited } }) as never;
const row = (standing: string) => ({ id: "r1", shortId: "r1", standing }) as never;

verifies("workflows.canvas.arrows", () => {
  it("hands the canvas the steps the run went through, in order", () => {
    const shown = shownRun(row("running"), run("write", ["start", "write"]), undefined);
    expect(shown.route).toEqual(["start", "write"]);
  });
});
