import {
  failedStartOf,
  type RunFailedEvent,
  type RunFailure,
  runFailureOf,
} from "@halonicjs/app/run-failure";
import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runFailedLines } from "./messages/run-failures.ts";
import { failedWith, log } from "./test/run-failure-fixtures.ts";

verifies("cli.run-failed-this-computer-start", () => {
  const started = (failed: RunFailedEvent, events: RunEvent[]) => failedStartOf(events, failed);

  /** Line 1 and line 2 of a failure, as plain words, with the step `Build report`. */
  function wordsOf(failure: RunFailure | undefined): [string, string] {
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Build report", runId: "01JD8Q" };
    const { message, fix } = runFailedLines(run, failure);
    if (fix === undefined) throw new Error("expected line 2");
    return [plainText(message.phrase), plainText(fix.phrase)];
  }

  describe("this-computer-start-failed", () => {
    const failed = {
      ...failedWith("this-computer-start-failed"),
      state: "build",
      error: "a program started without a fence can't reach a bridge on a Unix socket",
    };

    it("names the agent and the launcher's reason, and never a sandbox", () => {
      const events = log({
        type: "sandbox.started",
        state: "build",
        agent: "reporter",
        timeoutMs: 30_000,
      });
      const failure = runFailureOf(failed, undefined, started(failed, events));
      expect(failure).toEqual({
        reason: "this-computer-start-failed",
        agent: "reporter",
        launcherReason: "a program started without a fence can't reach a bridge on a Unix socket",
      });
      const [lineOne, lineTwo] = wordsOf(failure);
      expect([lineOne, lineTwo]).toEqual([
        "Support reply failed in the step Build report: reporter didn't start on this computer: a program started without a fence can't reach a bridge on a Unix socket.",
        "Add --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
      ]);
      expect(lineOne).not.toMatch(/sandbox/u);
      expect(lineTwo).not.toMatch(/run it again/iu);
    });

    it("asks only for the report when --debug was given", () => {
      const failure: RunFailure = {
        reason: "this-computer-start-failed",
        agent: "reporter",
        launcherReason: "Halonic can't tell why",
      };
      const run = {
        title: "Support reply",
        step: "Build report",
        runId: "01JD8Q",
        debugging: true,
      };
      const { fix } = runFailedLines(run, failure);
      expect(fix === undefined ? "" : plainText(fix.phrase)).toBe(
        "Report it with the details below: https://github.com/halonic-com/halonic/issues",
      );
    });

    it("gets the general lines when the step's log has no sandbox.started", () => {
      expect(runFailureOf(failed, undefined, started(failed, log()))).toEqual({
        reason: "error",
        message: failed.error,
      });
    });
  });
});
