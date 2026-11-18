import type { RunFailureKind } from "@halonicjs/events";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { BudgetReachedError } from "../budget/call-budget.ts";
import { failedCallInput } from "./failed-call-input.ts";
import { failureCauseOf } from "./failure-cause-of.ts";

/** An error the way an integration throws one: a kind and the cause it names. */
function integrationError(kind: string, failureCause?: unknown): Error {
  return Object.assign(new Error("The API is off."), { kind, failureCause });
}

verifies("engine.run-failure-cause-of", () => {
  typeTest("keeps the kinds of a cause equal to the kit's error kinds", () => {
    expectTypeOf<RunFailureKind>().toEqualTypeOf<ErrorKind>();
  });

  it("takes the kind, the code and the detail an integration names", () => {
    const detail = { api: "drive.googleapis.com", project: "123456" };
    const error = integrationError("denied", { code: "google.api-disabled", detail });
    expect(failureCauseOf(error)).toEqual({ kind: "denied", code: "google.api-disabled", detail });
  });

  it("gives only the kind of an error that names no cause", () => {
    expect(failureCauseOf(new KindedError("unavailable", "Ollama is down."))).toStrictEqual({
      kind: "unavailable",
    });
  });

  it("gives no cause for an error without a kind or with the kind internal", () => {
    expect(failureCauseOf(new TypeError("x is undefined"))).toBeUndefined();
    expect(failureCauseOf(new KindedError("internal", "A bug."))).toBeUndefined();
    expect(failureCauseOf("boom")).toBeUndefined();
  });

  it("drops a code that isn't a code, and every detail entry it can't trust", () => {
    const error = integrationError("denied", {
      code: "Not A Code",
      detail: {
        leaked: `sk-${"Q7x2Lm9K".repeat(3)}`,
        count: 3,
        long: "x".repeat(301),
        "bad key": "fine",
      },
    });
    expect(failureCauseOf(error)).toStrictEqual({ kind: "denied" });
  });

  it("keeps the good entries next to a bad one, at most eight", () => {
    const detail = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`entry${i}`, "v"]));
    const cause = failureCauseOf(integrationError("denied", { detail: { ...detail, count: 3 } }));
    expect(Object.keys(cause?.detail ?? {})).toHaveLength(8);
  });

  it("reads a failureCause that isn't an object as none", () => {
    expect(failureCauseOf(integrationError("denied", "api-disabled"))).toStrictEqual({
      kind: "denied",
    });
    expect(failureCauseOf(integrationError("denied", { detail: "x" }))).toStrictEqual({
      kind: "denied",
    });
  });

  it("takes nothing from the cause of the error", () => {
    const inner = integrationError("denied", { code: "google.api-disabled" });
    const error = new KindedError("unavailable", "Wrapped.", { cause: inner });
    expect(failureCauseOf(error)).toStrictEqual({ kind: "unavailable" });
  });

  it("puts the cause on the input of a call that failed with such an error", () => {
    const error = integrationError("denied", { code: "google.api-disabled" });
    const input = failedCallInput(error, {
      callId: "call-3",
      at: "2026-11-17T09:00:00.000Z",
      step: "draft",
    });
    expect(input).toMatchObject({
      reason: "error",
      cause: { kind: "denied", code: "google.api-disabled" },
    });
    expect(
      failedCallInput(new Error("boom"), { callId: "c", at: "t", step: "s" }),
    ).not.toHaveProperty("cause");
  });

  it("passes a budget stop's cause on with the reason budget", () => {
    const cause = {
      kind: "limit_reached",
      code: "budget.run",
      detail: { limit: "1", spent: "1.5", currency: "EUR" },
    } as const;
    const input = failedCallInput(new BudgetReachedError("Run budget reached.", cause), {
      callId: "call-3",
      at: "2026-11-17T09:00:00.000Z",
      step: "draft",
    });
    expect(input).toMatchObject({ reason: "budget", cause });
  });
});
