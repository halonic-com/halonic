import { describe, expect, it } from "vitest";
import { runExample } from "../examples/next-due-times.ts";

describe("the README example", () => {
  it("runs and gives the results its comments promise", () => {
    expect(runExample()).toEqual({
      dueNow: ["@workspace/morning-brief at 2026-11-09T07:00:00.000Z"],
      next: "2026-11-10T07:00:00.000Z",
      nextWeek: [
        "2026-11-10T07:00:00.000Z",
        "2026-11-11T07:00:00.000Z",
        "2026-11-12T07:00:00.000Z",
        "2026-11-13T07:00:00.000Z",
        "2026-11-16T07:00:00.000Z",
      ],
    });
  });
});
