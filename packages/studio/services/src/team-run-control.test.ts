import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  runAgainFailureWords,
  runAgainNotice,
  stopFailureWords,
  TeamRunControlService,
} from "./team-run-control.ts";

verifies("services.team-run-control", () => {
  it("offers the port through one service key", () => {
    expect(TeamRunControlService.name).toBe("team-run-control");
  });

  describe("Stop", () => {
    it("says the design's line for every refusal, and nothing when it went through", () => {
      for (const reason of ["not-stoppable", "not-found", "not-allowed", "unreachable"] as const) {
        expect(stopFailureWords({ outcome: "refused", reason })).toBe(
          "Couldn't stop the run. It may have ended already.",
        );
      }
      expect(stopFailureWords({ outcome: "stopping" })).toBeUndefined();
    });
  });

  describe("Run again", () => {
    it("puts the Studio's own reason after the existing lead", () => {
      expect(runAgainFailureWords({ outcome: "refused", reason: "unreachable" })).toBe(
        "Couldn't start the run: the team's server isn't answering.",
      );
      expect(runAgainFailureWords({ outcome: "refused", reason: "task-done" })).toBe(
        "Couldn't start the run: the task is done.",
      );
      expect(runAgainFailureWords({ outcome: "woken" })).toBeUndefined();
    });

    it("says why it isn't offered when the task closed or moved", () => {
      expect(runAgainNotice({ offered: false, why: "task-done", task: "ACME-7" })).toBe(
        "ACME-7 is done, so there's nothing to run again.",
      );
      expect(
        runAgainNotice({ offered: false, why: "reassigned", task: "ACME-7", holder: "Bo" }),
      ).toBe("ACME-7 is with Bo now.");
      expect(runAgainNotice({ offered: false, why: "reassigned", task: "ACME-7" })).toBe(
        "ACME-7 is with someone else now.",
      );
    });

    it("adds no line when it is offered, there's no task, or the check couldn't be made", () => {
      expect(runAgainNotice({ offered: true })).toBeUndefined();
      expect(runAgainNotice({ offered: false, why: "no-task" })).toBeUndefined();
      expect(runAgainNotice({ offered: false, why: "unreachable" })).toBeUndefined();
      expect(
        runAgainNotice({ offered: false, why: "not-allowed", task: "ACME-7" }),
      ).toBeUndefined();
    });
  });
});
