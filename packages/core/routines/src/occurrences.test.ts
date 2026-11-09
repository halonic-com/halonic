import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { occurrences } from "./occurrences.ts";

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();
const hourly = { schedule: "0 * * * *", timezone: "UTC" };

verifies("routines.occurrences", () => {
  // Ported from "lists occurrences in a window" at 784f78d.
  it("lists the times in a window, the end included", () => {
    const times = occurrences(hourly, at("2026-11-03T08:30:00Z"), at("2026-11-03T11:00:00Z"));
    expect(times.map(iso)).toEqual([
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T11:00:00.000Z",
    ]);
  });

  it("leaves the start out", () => {
    const times = occurrences(hourly, at("2026-11-03T09:00:00Z"), at("2026-11-03T10:30:00Z"));
    expect(times.map(iso)).toEqual(["2026-11-03T10:00:00.000Z"]);
  });

  it("stops at the limit, keeping the oldest", () => {
    const times = occurrences(hourly, at("2026-11-03T08:30:00Z"), at("2026-11-04T08:30:00Z"), 2);
    expect(times.map(iso)).toEqual(["2026-11-03T09:00:00.000Z", "2026-11-03T10:00:00.000Z"]);
  });

  it("uses the given zone for a schedule that names none, as due does", () => {
    const daily = { schedule: "0 9 * * *" };
    const from = at("2026-11-03T10:00:00Z");
    const to = at("2026-11-04T10:00:00Z");
    expect(occurrences(daily, from, to).map(iso)).toEqual(["2026-11-04T09:00:00.000Z"]);
    expect(occurrences(daily, from, to, 100, "Asia/Tokyo").map(iso)).toEqual([
      "2026-11-04T00:00:00.000Z",
    ]);
  });

  it("throws a CronError for an unknown zone", () => {
    const from = at("2026-11-03T10:00:00Z");
    const to = at("2026-11-04T10:00:00Z");
    expect(() =>
      occurrences({ schedule: "0 9 * * *", timezone: "Mars/Olympus" }, from, to),
    ).toThrow(CronError);
    expect(() => occurrences({ schedule: "0 9 * * *" }, from, to, 100, "Mars/Olympus")).toThrow(
      CronError,
    );
  });

  it("is empty for a trigger without a schedule", () => {
    expect(
      occurrences({ every: "1h" }, at("2026-11-03T08:00:00Z"), at("2026-11-04T08:00:00Z")),
    ).toEqual([]);
  });

  it("is empty when the cron never fires in the window", () => {
    const never = { schedule: "0 0 30 2 *", timezone: "UTC" };
    expect(occurrences(never, at("2026-01-01T00:00:00Z"), at("2026-12-31T00:00:00Z"))).toEqual([]);
  });
});
