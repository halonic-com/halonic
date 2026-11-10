import type { HarnessEvent, HarnessRun } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { expectNoToken, readToEnd } from "./harness.ts";

const token = "contract-token-broken-harness";

/** A process error the way execa or Node report one: the program's words sit in the error's own fields. */
function processError(): Error {
  return Object.assign(new Error("script-agent stopped with code 1"), {
    command: "script-agent",
    stderr: `the provider refused ${token}`,
  });
}

/** A broken run: it yields `events`, then ends by itself or with `error`. */
function brokenRun(events: HarnessEvent[], error?: Error): HarnessRun {
  async function* stream(): AsyncGenerator<HarnessEvent> {
    yield* events;
    if (error !== undefined) throw error;
  }
  return {
    [Symbol.asyncIterator]: stream,
    send: async () => {
      throw new Error("The run has ended");
    },
    cancel: async () => undefined,
  };
}

/** The task agent's finish, with `output` as its result. */
function finished(output: unknown): HarnessEvent {
  return { type: "agent.finished", agent: "writer", output };
}

verifies("contracts.harness", () => {
  describe("Harness contract's token check, on a broken harness", () => {
    it("finds the token in an Error's message inside an event, which JSON.stringify hides", async () => {
      const events = [finished(new Error(`the provider refused ${token}`))];
      expect(JSON.stringify(events)).not.toContain(token);

      const end = await readToEnd(brokenRun(events));
      expect(() => expectNoToken(end, token)).toThrow();
    });

    it("finds the token in an Error's own field inside an event", async () => {
      const end = await readToEnd(brokenRun([finished(processError())]));
      expect(() => expectNoToken(end, token)).toThrow();
    });

    it("finds the token in an own field of the Error the stream ends with", async () => {
      const end = await readToEnd(brokenRun([], processError()));
      expect(end.ended).toBe("error");
      expect(() => expectNoToken(end, token)).toThrow();
    });

    it("finds the token in an own field of an Error's cause", async () => {
      const error = new Error("The run failed", { cause: processError() });
      const end = await readToEnd(brokenRun([], error));
      expect(() => expectNoToken(end, token)).toThrow();
    });
  });
});
