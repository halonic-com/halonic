import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { limitOf, type RunRow } from "./reviewer-limits.ts";

/** When a reviewer counts as limited (HAL-19203), from runs shaped like Paperclip's of 26 Nov. */

const now = new Date("2026-11-26T06:00:00Z");

function run(extra: Partial<RunRow>): RunRow {
  return {
    status: "succeeded",
    scheduledRetryReason: null,
    errorCode: null,
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
});
