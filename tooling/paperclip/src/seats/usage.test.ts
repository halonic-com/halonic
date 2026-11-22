import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { parseUsage, resetInstant } from "./usage.ts";

const readAt = "2026-11-22T10:00:00.000Z";

verifies("paperclip.seats-usage", () => {
  test("each usage line becomes a window with its kind, percent and reset", () => {
    const text = [
      "Current session: 23% used · resets Nov 22, 3pm (UTC)",
      "Current week (all models): 41% used · resets Nov 25, 9:30am (UTC)",
      "Current week (Sonnet only): 12% used · resets Nov 25, 9:30am (UTC)",
    ].join("\n");

    expect(parseUsage(text, readAt)).toEqual({
      kind: "read",
      at: readAt,
      windows: [
        {
          kind: "session",
          model: undefined,
          usedPercent: 23,
          resetsAt: "2026-11-22T15:00:00.000Z",
          resetText: "Nov 22, 3pm (UTC)",
        },
        {
          kind: "week",
          model: undefined,
          usedPercent: 41,
          resetsAt: "2026-11-25T09:30:00.000Z",
          resetText: "Nov 25, 9:30am (UTC)",
        },
        {
          kind: "week-model",
          model: "Sonnet only",
          usedPercent: 12,
          resetsAt: "2026-11-25T09:30:00.000Z",
          resetText: "Nov 25, 9:30am (UTC)",
        },
      ],
    });
  });

  test("a reset is read in the time zone the line names", () => {
    const at = Date.parse(readAt);
    expect(new Date(resetInstant("Nov 25, 9:30am (Europe/Amsterdam)", at) ?? 0).toISOString()).toBe(
      "2026-11-25T08:30:00.000Z",
    );
    expect(new Date(resetInstant("Nov 23, 12am (America/New_York)", at) ?? 0).toISOString()).toBe(
      "2026-11-23T05:00:00.000Z",
    );
  });

  test("a reset in summer time uses the summer offset", () => {
    const at = Date.parse("2026-07-01T10:00:00.000Z");
    expect(new Date(resetInstant("Jul 3, 12pm (Europe/Amsterdam)", at) ?? 0).toISOString()).toBe(
      "2026-07-03T10:00:00.000Z",
    );
  });

  test("a reset in another year carries its year", () => {
    const at = Date.parse("2026-12-30T10:00:00.000Z");
    expect(new Date(resetInstant("Jan 2, 2027, 9am (UTC)", at) ?? 0).toISOString()).toBe(
      "2027-01-02T09:00:00.000Z",
    );
  });

  test("a reset with only a time is the next time the clock shows it", () => {
    const lateEvening = Date.parse("2026-11-22T23:00:00.000Z");
    expect(new Date(resetInstant("2am (UTC)", lateEvening) ?? 0).toISOString()).toBe(
      "2026-11-23T02:00:00.000Z",
    );
    expect(new Date(resetInstant("11:30pm (UTC)", lateEvening) ?? 0).toISOString()).toBe(
      "2026-11-22T23:30:00.000Z",
    );
  });

  test("an unknown time zone leaves the reset unread but keeps the percent", () => {
    const reading = parseUsage("Current session: 5% used · resets Nov 22, 3pm (Mars/Base)", readAt);
    expect(reading).toMatchObject({
      kind: "read",
      windows: [
        {
          kind: "session",
          usedPercent: 5,
          resetsAt: undefined,
          resetText: "Nov 22, 3pm (Mars/Base)",
        },
      ],
    });
  });

  test("a window without a reset is read without one", () => {
    const reading = parseUsage("Current session: 0% used", readAt);
    expect(reading).toMatchObject({
      kind: "read",
      windows: [{ usedPercent: 0, resetText: undefined }],
    });
  });

  test("text with no usage line is unreadable, not empty", () => {
    expect(parseUsage("Usage on claude.ai: /settings/usage\n", readAt)).toEqual({
      kind: "unreadable",
      at: readAt,
      why: "no usage line in the output",
    });
    expect(parseUsage("", readAt).kind).toBe("unreadable");
  });
});
