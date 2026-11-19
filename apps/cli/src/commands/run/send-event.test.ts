import { type RunDetail, type RunEventRefusal, RunEventRefused } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { OwnLineError } from "../../command.ts";
import { type RunPlace, sendEvent } from "./send-event.ts";

const runId = "run_mfx3k2a0_01jd8q";

// Only the id is read for these refusals, so the summary stays empty. The
// workspace has no files: a step the run's workflow can't be found for is
// named by its id.
const summary = { id: runId } as RunSummary;
const run: RunDetail = { summary, events: [] };
const workspace = { files: [] } as unknown as LoadedWorkspace;
const place: RunPlace = { workspace, name: "acme", dir: "./acme" };

/** A `RunEvents` that refuses every send for `refusal`. */
function refusing(refusal: RunEventRefusal) {
  return {
    sendEvent: async (id: string, event: string): Promise<never> => {
      throw new RunEventRefused(id, event, refusal);
    },
  };
}

verifies("cli.run", () => {
  describe("sending an --event", () => {
    it("says it was sent", async () => {
      const sent: string[] = [];
      const runEvents = {
        sendEvent: async (id: string, event: string) => {
          sent.push(`${id} ${event}`);
          return summary;
        },
      };

      expect(await sendEvent(runEvents, place, run, "approve")).toBe(true);
      expect(sent).toEqual([`${runId} approve`]);
    });

    it("says it wasn't sent when the run no longer waits: someone answered first", async () => {
      const runEvents = refusing({ reason: "not-waiting", run: summary });

      expect(await sendEvent(runEvents, place, run, "approve")).toBe(false);
    });

    it("refuses with runs send's words when the run is gone", async () => {
      const sending = sendEvent(refusing({ reason: "no-run" }), place, run, "approve");

      await expect(sending).rejects.toThrow(OwnLineError);
      await expect(sending).rejects.toMatchObject({
        kind: "not_found",
        message: "Couldn't send approve to run 01jd8q: there's no run 01jd8q in acme.",
        fix: "See the runs waiting for you with halonic runs --dir ./acme --status waiting.",
      });
    });

    it("points to the step, in the run's folder, when no event the step takes is close", async () => {
      const refusal: RunEventRefusal = {
        reason: "event-not-taken",
        step: "review",
        accepts: ["approve", "reject"],
      };
      const sending = sendEvent(refusing(refusal), place, run, "xyz");

      await expect(sending).rejects.toMatchObject({
        kind: "invalid_input",
        fix: "Run halonic runs show --dir ./acme 01jd8q to see the step.",
      });
    });

    it("quotes a --dir with a space in the step's command, so it can be pasted back", async () => {
      const refusal: RunEventRefusal = {
        reason: "event-not-taken",
        step: "review",
        accepts: ["approve", "reject"],
      };
      const spaced: RunPlace = { ...place, dir: "./Acme sample" };
      const sending = sendEvent(refusing(refusal), spaced, run, "xyz");

      await expect(sending).rejects.toMatchObject({
        fix: 'Run halonic runs show --dir "./Acme sample" 01jd8q to see the step.',
      });
    });

    it("passes on an error that isn't a refusal", async () => {
      const broken = new Error("The engine stopped.");
      const runEvents = {
        sendEvent: async (): Promise<never> => {
          throw broken;
        },
      };

      await expect(sendEvent(runEvents, place, run, "approve")).rejects.toBe(broken);
    });
  });
});
