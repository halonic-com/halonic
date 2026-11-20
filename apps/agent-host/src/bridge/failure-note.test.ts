import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { failureNoteOf } from "./failure-note.ts";

function withCause(error: Error, failureCause: unknown): Error {
  return Object.assign(error, { failureCause });
}

verifies("agent-host.bridge-failure-cause", () => {
  describe("failureNoteOf", () => {
    it("keeps the error's kind and cause", () => {
      const error = withCause(new KindedError("invalid_input", "Too long."), {
        code: "harness-bridge.socket-path-too-long",
        detail: { bytes: "120", limit: "104" },
      });
      expect(failureNoteOf(error)).toEqual({
        kind: "invalid_input",
        failureCause: {
          code: "harness-bridge.socket-path-too-long",
          detail: { bytes: "120", limit: "104" },
        },
      });
    });

    it("sends no kind for an error without one, nor for a value that isn't an error", () => {
      expect(failureNoteOf(new Error("no free port"))).toEqual({});
      expect(failureNoteOf("no free port")).toEqual({});
      expect(failureNoteOf(new KindedError("internal", "A bug."))).toEqual({});
    });

    it("keeps a cause on an error without a kind, for the engine to weigh", () => {
      const error = withCause(new Error("x"), { code: "harness-bridge.x" });
      expect(failureNoteOf(error)).toEqual({ failureCause: { code: "harness-bridge.x" } });
    });

    it("leaves out a code longer than 64 characters", () => {
      const error = withCause(new KindedError("unavailable", "x"), {
        code: "a".repeat(65),
        detail: { system: "Linux" },
      });
      expect(failureNoteOf(error)).toEqual({
        kind: "unavailable",
        failureCause: { detail: { system: "Linux" } },
      });
    });

    it("leaves out detail entries that don't fit, and keeps at most 8", () => {
      const detail: Record<string, unknown> = {
        long: "v".repeat(301),
        [`k${"e".repeat(40)}`]: "value",
        number: 120,
      };
      for (let index = 0; index < 10; index += 1) detail[`entry${index}`] = String(index);
      const error = withCause(new KindedError("unavailable", "x"), { detail });
      const kept = failureNoteOf(error).failureCause?.detail ?? {};
      expect(Object.keys(kept)).toEqual([
        "entry0",
        "entry1",
        "entry2",
        "entry3",
        "entry4",
        "entry5",
        "entry6",
        "entry7",
      ]);
    });

    it("sends no cause when nothing in it fits", () => {
      const kinded = new KindedError("unavailable", "x");
      expect(failureNoteOf(withCause(kinded, { code: "", detail: { a: 1 } }))).toEqual({
        kind: "unavailable",
      });
      expect(failureNoteOf(withCause(new KindedError("unavailable", "x"), "a code"))).toEqual({
        kind: "unavailable",
      });
    });
  });
});
