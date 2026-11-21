import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isSetupCause, type RunFailedEvent, runFailureOf } from "./run-failure.ts";

// A run whose key may not go to its provider's address names the provider,
// the key and the address, so a client can say how to allow it (HAL-15330).

function failedWith(cause: NonNullable<RunFailedEvent["cause"]>): RunFailedEvent {
  return {
    runId: "01JD8Q",
    seq: 9,
    at: "2026-11-10T09:00:00.000Z",
    type: "run.failed",
    state: "draft",
    error: "the engine's own words",
    reason: "error",
    cause,
  };
}

const detail = { provider: "gateway", key: "fake-key", origin: "https://other.example.com" };
const cause = { kind: "denied" as const, code: "models.key-origin-not-allowed", detail };

verifies("app.run-failure-key-origin", () => {
  it("names the provider, the key and the address, as this computer's setup", () => {
    expect(runFailureOf(failedWith(cause), undefined)).toEqual({
      reason: "key-origin-not-allowed",
      ...detail,
    });
    expect(isSetupCause(cause)).toBe(true);
  });

  it("gives the engine's own message when the cause misses the address", () => {
    const { origin: _, ...withoutAddress } = detail;
    const partial = { ...cause, detail: withoutAddress };

    expect(runFailureOf(failedWith(partial), undefined)).toEqual({
      reason: "error",
      message: "the engine's own words",
    });
    expect(isSetupCause(partial)).toBe(false);
  });
});
