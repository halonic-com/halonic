import { ModelCallError, RunFailureError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runFailureReasonOf } from "./run-failure-reason-of.ts";

/** An error as another copy of `@halonicjs/ports` would build it: same name and fields, other class. */
function fromOtherCopy(name: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error("from another copy"), { name, ...fields });
}

/** An error with a name, as `fetch` and `AbortSignal.timeout` throw them. */
function named(name: string): Error {
  return Object.assign(new Error(name), { name });
}

verifies("engine.run-failure-reason-of", () => {
  describe("a model call failure", () => {
    it("gives model-unreachable for offline, with its host", () => {
      const error = new ModelCallError("offline", "Ollama didn't answer.", {
        host: "localhost:11434",
      });
      expect(runFailureReasonOf(error)).toEqual({
        reason: "model-unreachable",
        host: "localhost:11434",
      });
    });

    it("gives model-unreachable without a host when the provider didn't name one", () => {
      expect(runFailureReasonOf(new ModelCallError("offline", "no route"))).toEqual({
        reason: "model-unreachable",
      });
    });

    it("gives model-out-of-memory for out-of-memory", () => {
      expect(runFailureReasonOf(new ModelCallError("out-of-memory", "too big"))).toEqual({
        reason: "model-out-of-memory",
      });
    });

    it.each(["model-missing", "model-no-tools"] as const)("keeps %s", (reason) => {
      expect(runFailureReasonOf(new ModelCallError(reason, "x"))).toEqual({ reason });
    });

    it.each(["no-key", "refused"] as const)("gives error for %s", (reason) => {
      expect(runFailureReasonOf(new ModelCallError(reason, "x"))).toEqual({ reason: "error" });
    });

    it("reads one from another copy of the ports package", () => {
      const error = fromOtherCopy("ModelCallError", { reason: "offline", host: "localhost:11434" });
      expect(runFailureReasonOf(error)).toEqual({
        reason: "model-unreachable",
        host: "localhost:11434",
      });
    });
  });

  describe("an adapter's run failure", () => {
    it.each(["disk-full", "sandbox-start-failed", "harness-start-failed"] as const)(
      "gives %s",
      (failure) => {
        expect(runFailureReasonOf(new RunFailureError(failure, "x"))).toEqual({ reason: failure });
      },
    );

    it("reads one from another copy of the ports package", () => {
      const error = fromOtherCopy("RunFailureError", { failure: "sandbox-start-failed" });
      expect(runFailureReasonOf(error)).toEqual({ reason: "sandbox-start-failed" });
    });
  });

  it("gives disk-full for a Node error with the code ENOSPC", () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write"), {
      code: "ENOSPC",
    });
    expect(runFailureReasonOf(error)).toEqual({ reason: "disk-full" });
  });

  it("gives cancelled for an aborted call", () => {
    expect(runFailureReasonOf(named("AbortError"))).toEqual({ reason: "cancelled" });
  });

  it.each([
    ["a timed-out call", named("TimeoutError")],
    ["a plain error", new Error("broke")],
    ["a value that isn't an error", "broke"],
    ["an error with only an error kind", Object.assign(new Error("gone"), { kind: "unavailable" })],
    [
      "an error whose cause is a run failure",
      new Error("wrapped", { cause: new RunFailureError("disk-full", "x") }),
    ],
  ])("gives error for %s", (_case, error) => {
    expect(runFailureReasonOf(error)).toEqual({ reason: "error" });
  });
});
