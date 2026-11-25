import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { costPeriodStart } from "./cost-period.ts";

verifies("runs.costs", () => {
  describe("costPeriodStart", () => {
    const madridMorning = new Date("2026-11-25T10:00:00Z");

    it("starts today, 7 days and 30 days at local midnight, today included", () => {
      expect(costPeriodStart("today", madridMorning, "Europe/Madrid").toISOString()).toBe(
        "2026-11-24T23:00:00.000Z",
      );
      expect(costPeriodStart("7-days", madridMorning, "Europe/Madrid").toISOString()).toBe(
        "2026-11-18T23:00:00.000Z",
      );
      expect(costPeriodStart("30-days", madridMorning, "Europe/Madrid").toISOString()).toBe(
        "2026-10-26T23:00:00.000Z",
      );
    });

    it("uses the day in the given zone, not in UTC", () => {
      const lateInUtc = new Date("2026-11-25T23:30:00Z");
      expect(costPeriodStart("today", lateInUtc, "UTC").toISOString()).toBe(
        "2026-11-25T00:00:00.000Z",
      );
      expect(costPeriodStart("today", lateInUtc, "Europe/Madrid").toISOString()).toBe(
        "2026-11-25T23:00:00.000Z",
      );
      expect(costPeriodStart("today", lateInUtc, "America/New_York").toISOString()).toBe(
        "2026-11-25T05:00:00.000Z",
      );
    });

    it("starts at local midnight across the change to summer time", () => {
      const dayAfterSpringForward = new Date("2026-03-30T10:00:00Z");
      expect(costPeriodStart("today", dayAfterSpringForward, "Europe/Madrid").toISOString()).toBe(
        "2026-03-29T22:00:00.000Z",
      );
      expect(costPeriodStart("7-days", dayAfterSpringForward, "Europe/Madrid").toISOString()).toBe(
        "2026-03-23T23:00:00.000Z",
      );
    });

    it("starts at local midnight across the change back to winter time", () => {
      const dayAfterFallBack = new Date("2026-10-26T10:00:00Z");
      expect(costPeriodStart("today", dayAfterFallBack, "Europe/Madrid").toISOString()).toBe(
        "2026-10-25T23:00:00.000Z",
      );
      expect(costPeriodStart("7-days", dayAfterFallBack, "Europe/Madrid").toISOString()).toBe(
        "2026-10-19T22:00:00.000Z",
      );
    });

    it("starts the day the clocks change at its real midnight", () => {
      const springForwardNoon = new Date("2026-03-29T10:00:00Z");
      expect(costPeriodStart("today", springForwardNoon, "Europe/Madrid").toISOString()).toBe(
        "2026-03-28T23:00:00.000Z",
      );
    });

    it("starts a day with no midnight when the clocks jump, not an hour before", () => {
      // America/Santiago springs from 00:00 straight to 01:00 on 6 September 2026.
      const noon = new Date("2026-09-06T12:00:00Z");
      expect(costPeriodStart("today", noon, "America/Santiago").toISOString()).toBe(
        "2026-09-06T04:00:00.000Z",
      );
    });

    it("starts a day whose midnight comes after the clocks go back at its one midnight", () => {
      // America/Santiago falls back from 00:00 to 23:00 on 5 April 2026.
      const noon = new Date("2026-04-05T12:00:00Z");
      expect(costPeriodStart("today", noon, "America/Santiago").toISOString()).toBe(
        "2026-04-05T04:00:00.000Z",
      );
    });
  });
});
