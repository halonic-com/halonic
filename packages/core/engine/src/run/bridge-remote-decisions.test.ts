import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { InputRefused, type RefusalCode } from "../kernel/input-refused.ts";
import { remoteDecisionsOf } from "./bridge-remote-decisions.ts";

verifies("engine.remote-decision", () => {
  /** Decisions on a question that waits as `call-2`, where the run refuses the send for `code`, if given. */
  function decisions(code?: RefusalCode) {
    return remoteDecisionsOf({
      questionOf: (callId) => (callId === "toolu_9" ? "call-2" : undefined),
      send: async () => {
        if (code !== undefined) throw new InputRefused(code, "refused");
      },
    });
  }

  it("answers unknown when the run ended between the lookup and the send", async () => {
    const outcome = await decisions("engine.run-ended").decide({
      callId: "toolu_9",
      approved: true,
    });

    expect(outcome).toBe("unknown");
  });

  it("answers already-decided when another answer took the question first", async () => {
    const outcome = await decisions("engine.input-not-accepted").decide({
      callId: "toolu_9",
      approved: false,
    });

    expect(outcome).toBe("already-decided");
  });

  it("answers unknown for a question that isn't waiting", async () => {
    expect(await decisions().decide({ callId: "toolu_1", approved: true })).toBe("unknown");
  });
});
