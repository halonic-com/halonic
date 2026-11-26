import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { resetTimeOf } from "./limit-reset.ts";
import { limitOf, type RunRow } from "./reviewer-limits.ts";

/** When a reviewer counts as limited (HAL-19203), from runs shaped like Paperclip's of 26 Nov. */

const now = new Date("2026-11-26T06:00:00Z");

function run(extra: Partial<RunRow>): RunRow {
  return {
    status: "succeeded",
    scheduledRetryReason: null,
    errorCode: null,
    error: null,
    createdAt: "2026-11-26T04:00:00Z",
    startedAt: "2026-11-26T04:00:01Z",
    finishedAt: "2026-11-26T04:10:00Z",
    ...extra,
  };
}

const limitStop = run({
  status: "cancelled",
  errorCode: "provider_limit_wait",
  createdAt: "2026-11-26T05:00:00Z",
  startedAt: "2026-11-26T05:00:01Z",
  finishedAt: "2026-11-26T05:00:31Z",
});

const parkedRun = run({
  status: "scheduled_retry",
  scheduledRetryReason: "ai_connection_pool_wait",
  createdAt: "2026-11-26T05:00:32Z",
  startedAt: null,
  finishedAt: null,
});

verifies("paperclip.pr-watcher-reroute", () => {
  test("a run parked on a pool wait limits its agent since it was created", () => {
    expect(limitOf([parkedRun, limitStop, run({})], now)).toEqual({
      why: "pool wait",
      since: "2026-11-26T05:00:32Z",
    });
  });

  test("a parked run doesn't count once another run of theirs started", () => {
    const resumed = run({ createdAt: "2026-11-26T05:19:00Z", startedAt: "2026-11-26T05:19:53Z" });
    expect(limitOf([resumed, parkedRun, limitStop], now)).toBeUndefined();
  });

  test("a pool-wait run that already runs doesn't count", () => {
    expect(limitOf([{ ...parkedRun, status: "running" }], now)).toBeUndefined();
  });

  test("a limit stop limits its agent until a run of theirs starts again", () => {
    const later = run({
      status: "scheduled_retry",
      scheduledRetryReason: "transient_failure",
      startedAt: null,
    });
    expect(limitOf([later, limitStop], now)).toEqual({
      why: "usage limit",
      since: "2026-11-26T05:00:31Z",
    });
    const quota = { ...limitStop, status: "failed", errorCode: "provider_quota" };
    expect(limitOf([quota], now)).toMatchObject({ why: "usage limit" });
    const started = run({ createdAt: "2026-11-26T05:30:00Z", startedAt: "2026-11-26T05:30:01Z" });
    expect(limitOf([started, limitStop], now)).toBeUndefined();
  });

  test("a limit stop older than 5 hours, or none, leaves its agent free", () => {
    expect(limitOf([limitStop], new Date("2026-11-26T10:01:00Z"))).toBeUndefined();
    expect(
      limitOf([run({}), run({ status: "cancelled", errorCode: "issue_reassigned" })], now),
    ).toBeUndefined();
    expect(limitOf([], now)).toBeUndefined();
  });

  test("a limit stop with a reset time counts only until that time", () => {
    function resetsAt(time: string): RunRow {
      return {
        ...limitStop,
        error: `The provider usage limit for this agent is expected to reset at ${time}. Paperclip will start this work then.`,
      };
    }
    expect(limitOf([resetsAt("2026-11-26T05:30:00.000Z")], now)).toBeUndefined();
    expect(limitOf([resetsAt("2026-11-26T07:00:00.000Z")], now)).toEqual({
      why: "usage limit",
      since: "2026-11-26T05:00:31Z",
    });
    // A reset past the 5-hour window still counts: the provider named it.
    const later = new Date("2026-11-26T10:30:00Z");
    expect(limitOf([resetsAt("2026-11-26T11:00:00.000Z")], later)).toMatchObject({
      why: "usage limit",
    });
    // With no reset time in the message, the 5-hour window stays.
    const noReset = { ...limitStop, error: "The provider stopped this run." };
    expect(limitOf([noReset], now)).toMatchObject({ why: "usage limit" });
    expect(limitOf([noReset], new Date("2026-11-26T10:01:00Z"))).toBeUndefined();
  });

  test("a provider's reset hour in UTC counts until its next occurrence after the stop", () => {
    const quota = (error: string): RunRow => ({
      ...limitStop,
      status: "failed",
      errorCode: "provider_quota",
      error: `ACP agent reported a terminal limit failure.\n${error}`,
    });
    const sevenAm = quota("You've hit your session limit · resets 7am (UTC)");
    expect(limitOf([sevenAm], now)).toMatchObject({ why: "usage limit" });
    expect(limitOf([sevenAm], new Date("2026-11-26T07:00:00Z"))).toBeUndefined();
    const fourAm = quota("You've hit your session limit · resets 4:30am (UTC)");
    expect(limitOf([fourAm], now)).toMatchObject({ why: "usage limit" });
    expect(resetTimeOf(fourAm.error, "2026-11-26T05:00:31Z")).toBe(
      Date.parse("2026-11-27T04:30:00Z"),
    );
    expect(resetTimeOf("resets 12pm (UTC)", "2026-11-26T05:00:31Z")).toBe(
      Date.parse("2026-11-26T12:00:00Z"),
    );
    expect(resetTimeOf("resets 12am (UTC)", "2026-11-26T05:00:31Z")).toBe(
      Date.parse("2026-11-27T00:00:00Z"),
    );
    // Another time zone, or no clock time, is no reset time.
    expect(resetTimeOf("resets 7am (Europe/Berlin)", "2026-11-26T05:00:31Z")).toBeUndefined();
    expect(resetTimeOf("resets 13pm (UTC)", "2026-11-26T05:00:31Z")).toBeUndefined();
    expect(resetTimeOf(null, "2026-11-26T05:00:31Z")).toBeUndefined();
  });
});
