import type { ErrorKind } from "@halonicjs/std";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ProviderText, RunFailureCause, RunFailureReason } from "./run-basics.ts";
import type { RunEventBody, RunEventType } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";
import { summarize } from "./summarize.ts";

// Type tests for why a run failed and for the waits a step logs before it
// calls out. `tsc -p tsconfig.test.json` fails if a reason or a field changes.

type EventOf<T extends RunEventType> = Extract<RunEventBody, { type: T }>;

/** True when `Reason` is one of the run failure reasons. */
type IsReason<Reason extends string> = Reason extends RunFailureReason ? true : false;

verifies("events.run-failed-reason", () => {
  typeTest("says why a run failed, from exactly this list", () => {
    expectTypeOf<RunFailureReason>().toEqualTypeOf<
      | "budget"
      | "cancelled"
      | "model-missing"
      | "model-no-tools"
      | "error"
      | "model-unreachable"
      | "model-out-of-memory"
      | "model-timeout"
      | "disk-full"
      | "interrupted"
      | "sandbox-not-ready"
      | "sandbox-start-failed"
      | "harness-start-failed"
      | "key-refused"
      | "out-of-credit"
      | "provider-busy"
      | "answer-not-an-option"
      | "harness-unavailable"
      | "local-only"
      | "instructions-not-trusted"
    >();
    expectTypeOf<EventOf<"run.failed">["reason"]>().toEqualTypeOf<RunFailureReason | undefined>();
  });

  typeTest("still accepts a run.failed event without a reason, as older logs have", () => {
    expectTypeOf<{
      type: "run.failed";
      state: null;
      error: string;
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-model-unreachable", () => {
  typeTest("names the host that didn't answer", () => {
    expectTypeOf<IsReason<"model-unreachable">>().toEqualTypeOf<true>();
    expectTypeOf<EventOf<"run.failed">["host"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "model-unreachable";
      host: string;
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-model-out-of-memory", () => {
  typeTest("has a reason for a model that ran out of memory", () => {
    expectTypeOf<IsReason<"model-out-of-memory">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-model-timeout", () => {
  typeTest("has a reason for a local model that gave no first answer", () => {
    expectTypeOf<IsReason<"model-timeout">>().toEqualTypeOf<true>();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "model-timeout";
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-disk-full", () => {
  typeTest("has a reason for a full disk", () => {
    expectTypeOf<IsReason<"disk-full">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-sandbox-not-ready", () => {
  typeTest("names why the sandbox can't start, by the port's code", () => {
    expectTypeOf<IsReason<"sandbox-not-ready">>().toEqualTypeOf<true>();
    expectTypeOf<EventOf<"run.failed">["sandboxReason"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "sandbox-not-ready";
      sandboxReason: string;
    }>().toExtend<EventOf<"run.failed">>();
  });

  typeTest("names the agent that didn't start", () => {
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "sandbox-not-ready";
      sandboxReason: string;
      agent: string;
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-interrupted", () => {
  typeTest("has a reason for a run the engine stopped in the middle of", () => {
    expectTypeOf<IsReason<"interrupted">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-sandbox-start-failed", () => {
  typeTest("has a reason for a sandbox that didn't start for this run", () => {
    expectTypeOf<IsReason<"sandbox-start-failed">>().toEqualTypeOf<true>();
  });

  typeTest("names why the sandbox can't start, by the port's code", () => {
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "sandbox-start-failed";
      sandboxReason: "bubblewrap-missing";
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-harness-cause", () => {
  typeTest("says why a harness didn't start, when the engine knows", () => {
    expectTypeOf<NonNullable<EventOf<"run.failed">["harnessCause"]>>().toEqualTypeOf<
      "not-installed" | "signed-out"
    >();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "harness-start-failed";
      harnessCause: "signed-out";
    }>().toExtend<EventOf<"run.failed">>();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "harness-start-failed";
    }>().toExtend<EventOf<"run.failed">>();
  });
});

verifies("events.run-failed-harness-start-failed", () => {
  typeTest("has a reason for a harness that didn't start", () => {
    expectTypeOf<IsReason<"harness-start-failed">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-key-refused", () => {
  typeTest("has a reason for a key the provider didn't accept, or no key at all", () => {
    expectTypeOf<IsReason<"key-refused">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-out-of-credit", () => {
  typeTest("has a reason for an account at the provider with no credit left", () => {
    expectTypeOf<IsReason<"out-of-credit">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-provider-busy", () => {
  typeTest("has a reason for a provider that was busy", () => {
    expectTypeOf<IsReason<"provider-busy">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-answer-not-an-option", () => {
  typeTest("has a reason for an answer that isn't one of the agent's options", () => {
    expectTypeOf<IsReason<"answer-not-an-option">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-harness-unavailable", () => {
  typeTest("has a reason for a harness step in an engine without harnesses", () => {
    expectTypeOf<IsReason<"harness-unavailable">>().toEqualTypeOf<true>();
  });
});

verifies("events.run-failed-local-only", () => {
  typeTest("has a reason for a local-only workspace with no local model", () => {
    expectTypeOf<IsReason<"local-only">>().toEqualTypeOf<true>();
  });
});

verifies("events.connector-started", () => {
  typeTest("names the step, the agent, the connector and the time limit", () => {
    expectTypeOf<EventOf<"connector.started">>().toEqualTypeOf<{
      type: "connector.started";
      state: string;
      agent: string;
      connector: string;
      timeoutMs: number;
    }>();
  });

  typeTest("doesn't accept the event without a time limit", () => {
    expectTypeOf<{
      type: "connector.started";
      state: string;
      agent: string;
      connector: string;
    }>().not.toExtend<EventOf<"connector.started">>();
  });
});

verifies("events.provider-text", () => {
  const providerText: ProviderText = { status: 400, text: "max_tokens is too large" };

  typeTest("keeps the provider's text on run.failed and llm.fallback, optionally", () => {
    expectTypeOf<ProviderText>().toEqualTypeOf<{ status?: number; text: string }>();
    expectTypeOf<EventOf<"run.failed">["providerText"]>().toEqualTypeOf<ProviderText | undefined>();
    expectTypeOf<EventOf<"llm.fallback">["providerText"]>().toEqualTypeOf<
      ProviderText | undefined
    >();
    expectTypeOf<{
      type: "llm.fallback";
      agent: string;
      from: string;
      to: string;
      error: string;
    }>().toExtend<EventOf<"llm.fallback">>();
  });

  it("leaves the provider's text out of the run summary", () => {
    const failed: RunEventBody = {
      type: "run.failed",
      state: "write",
      error: 'acme refused the call to the model "acme-small" (HTTP 400)',
      reason: "error",
      providerText,
    };
    const summary = summarize([
      {
        runId: "r",
        seq: 1,
        at: "T1",
        type: "run.started",
        hubId: "p",
        workflowId: "f",
        input: {},
        kind: "run",
        definitionsVersion: "v1",
      },
      { runId: "r", seq: 2, at: "T2", ...failed },
    ]);
    expect(summary?.error).toBe('acme refused the call to the model "acme-small" (HTTP 400)');
    expect(JSON.stringify(summary)).not.toContain(providerText.text);
  });
});

verifies("events.run-failed-instructions-not-trusted", () => {
  typeTest("names the agent, the pin the check saw and whether it changed", () => {
    expectTypeOf<IsReason<"instructions-not-trusted">>().toEqualTypeOf<true>();
    expectTypeOf<{
      type: "run.failed";
      state: string;
      error: string;
      reason: "instructions-not-trusted";
      agent: string;
      pin: { digest: string; files: Record<string, string> };
      changed: boolean;
    }>().toExtend<EventOf<"run.failed">>();
    expectTypeOf<{
      type: "agent.finished";
      state: string;
      agent: string;
      output: null;
      error: string;
      reason: "instructions-not-trusted";
      pin: { digest: string; files: Record<string, string> };
      changed: boolean;
    }>().toExtend<EventOf<"agent.finished">>();
  });
});

verifies("events.run-failed-cause", () => {
  typeTest("gives a cause a kind, and optionally a code and short strings", () => {
    expectTypeOf<RunFailureCause>().toEqualTypeOf<{
      readonly kind: ErrorKind;
      readonly code?: string;
      readonly detail?: Readonly<Record<string, string>>;
    }>();
    expectTypeOf<EventOf<"run.failed">["cause"]>().toEqualTypeOf<RunFailureCause | undefined>();
  });

  it("puts the cause of a failed run on its summary", () => {
    const cause: RunFailureCause = {
      kind: "denied",
      code: "google.api-disabled",
      detail: { api: "drive.googleapis.com" },
    };
    expect(
      summaryOf({ type: "run.failed", state: "s", error: "x", reason: "error", cause }).cause,
    ).toEqual(cause);
  });

  it("keeps a cause that has only a kind", () => {
    const summary = summaryOf({
      type: "run.failed",
      state: "s",
      error: "x",
      cause: { kind: "unavailable" },
    });
    expect(summary.cause).toEqual({ kind: "unavailable" });
  });

  it("loads a run.failed without a cause, as older logs have", () => {
    const summary = summaryOf({ type: "run.failed", state: "s", error: "x", reason: "budget" });
    expect(summary.cause).toBeUndefined();
    expect(summary.reason).toBe("budget");
  });

  it("has no cause while the run hasn't failed", () => {
    expect(summaryOf().cause).toBeUndefined();
  });
});
