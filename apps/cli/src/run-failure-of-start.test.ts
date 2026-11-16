import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { type RunFailure, runFailedLines } from "./messages/run-failures.ts";
import { failedStartOf, type RunFailedEvent, runFailureOf } from "./run-failure-of.ts";
import { calledModel, failedWith, general, log } from "./test/run-failure-fixtures.ts";

verifies("cli.run-failed-start-and-memory", () => {
  const started = (failed: RunFailedEvent, events: RunEvent[]) => failedStartOf(events, failed);

  /** Line 1 and line 2 of a failure, as plain words, with the step `Build report`. */
  function wordsOf(failure: RunFailure | undefined): [string, string] {
    if (failure === undefined) throw new Error("expected a failure");
    const run = { title: "Support reply", step: "Build report", runId: "01JD8Q" };
    const { message, fix } = runFailedLines(run, failure);
    if (fix === undefined) throw new Error("expected line 2");
    return [plainText(message.phrase), plainText(fix.phrase)];
  }

  describe("model-out-of-memory", () => {
    it("names the provider, the model and its alias, from the model called last", () => {
      const model = calledModel({ alias: "smart", model: "llama3.1:70b" });
      const failure = runFailureOf(failedWith("model-out-of-memory"), model);
      expect(failure).toEqual({
        reason: "model-out-of-memory",
        provider: "Ollama",
        model: "llama3.1:70b",
        alias: "smart",
      });
      expect(wordsOf(failure)).toEqual([
        "Support reply failed in the step Build report: this computer doesn't have enough free memory for Ollama to load llama3.1:70b.",
        "Close other programs, or point the model alias smart at a smaller model in models.yaml, then run it again.",
      ]);
    });

    it("gets the general lines when the run called no model", () => {
      expect(runFailureOf(failedWith("model-out-of-memory"), undefined)).toEqual(general);
    });
  });

  describe("sandbox-start-failed", () => {
    const failed = { ...failedWith("sandbox-start-failed"), state: "build" };

    it("names the agent of the step whose sandbox didn't start", () => {
      const events = log(
        { type: "sandbox.started", state: "draft", agent: "writer", timeoutMs: 30_000 },
        { type: "sandbox.started", state: "build", agent: "reporter", timeoutMs: 30_000 },
      );
      const failure = runFailureOf(failed, undefined, started(failed, events));
      expect(failure).toEqual({ reason: "sandbox-start-failed", agent: "reporter" });
      expect(wordsOf(failure)).toEqual([
        "Support reply failed in the step Build report: reporter didn't start, because the sandbox on this computer didn't start.",
        "Run it again. If it keeps happening, add --debug and report it: https://github.com/halonic-com/halonic/issues",
      ]);
    });

    it("gets the general lines when the step's log has no sandbox.started", () => {
      const events = log({
        type: "sandbox.started",
        state: "draft",
        agent: "writer",
        timeoutMs: 30_000,
      });
      expect(runFailureOf(failed, undefined, started(failed, events))).toEqual(general);
    });
  });

  describe("harness-start-failed", () => {
    const failed = { ...failedWith("harness-start-failed"), state: "draft" };
    const events = log({
      type: "harness.started",
      state: "draft",
      agent: "writer",
      harness: "claude-code",
      timeoutMs: 60_000,
    });

    it("names the agent, the program and how long Halonic waited for it", () => {
      const failure = runFailureOf(failed, undefined, started(failed, events));
      expect(failure).toEqual({
        reason: "harness-start-failed",
        agent: "writer",
        harness: "Claude Code",
        within: "60 seconds",
      });
      expect(wordsOf(failure)).toEqual([
        "Support reply failed in the step Build report: writer didn't start, because Claude Code didn't start on this computer or didn't answer within 60 seconds.",
        "Check that Claude Code starts in a terminal and is signed in, then run it again.",
      ]);
    });

    it("names a program it doesn't know by its id", () => {
      const other = log({
        type: "harness.started",
        state: "draft",
        agent: "writer",
        harness: "gemini",
        timeoutMs: 1000,
      });
      expect(runFailureOf(failed, undefined, started(failed, other))).toMatchObject({
        harness: "gemini",
        within: "1 second",
      });
    });

    it("gets the general lines when the step never started the program", () => {
      expect(runFailureOf(failed, undefined, undefined)).toEqual(general);
    });
  });
});
