import { expect, it } from "vitest";
import { queuedSentence, runTime, skipName, skipSentence, timeRange } from "./runs-words.ts";

// Tue 3 Nov 2026, 12:00 local.
const now = new Date(2026, 10, 3, 12, 0);
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month, day, hour, minute).toISOString();

it("says one time with its day, and a range within a day with the day once", () => {
  expect(timeRange(at(10, 3, 8), at(10, 3, 8), now)).toBe("08:00 Tue");
  expect(timeRange(at(10, 3, 7), at(10, 3, 9), now)).toBe("07:00 to 09:00 Tue");
});

it("says a range over several days with both days, and dates once the end is older than 6 days", () => {
  expect(timeRange(at(10, 1, 19), at(10, 2, 8), now)).toBe("19:00 Sun to 08:00 Mon");
  expect(timeRange(at(9, 26, 9), at(9, 27, 12), now)).toBe("09:00 Mon 26 Oct to 12:00 Tue 27 Oct");
});

it("says why a time didn't start", () => {
  const skip = { from: at(10, 3, 8), to: at(10, 3, 8), count: 1 };
  expect(skipSentence({ ...skip, reason: "busy" }, "Briefing", now)).toBe(
    "08:00 Tue: the last run was still busy",
  );
  expect(skipSentence({ ...skip, reason: "latest" }, "Briefing", now)).toBe(
    "08:00 Tue: missed while Halonic was closed or asleep (only the latest time ran)",
  );
  expect(skipSentence({ ...skip, reason: "target-never-live" }, "Briefing", now)).toBe(
    "08:00 Tue: Briefing isn't live yet",
  );
  expect(skipSentence({ ...skip, reason: "target-in-trash" }, "Briefing", now)).toBe(
    "08:00 Tue: Briefing was deleted",
  );
});

it("says a refused start with its sentence, or that Halonic can't explain it, and names it for a screen reader", () => {
  const sentence = "This window can't run Briefing.";
  const one = { reason: "start-refused" as const, from: at(10, 3, 8), to: at(10, 3, 8), count: 1 };
  expect(skipSentence({ ...one, sentence }, "Briefing", now)).toBe(
    "08:00 Tue: couldn't start. This window can't run Briefing.",
  );
  expect(skipSentence(one, "Briefing", now)).toBe(
    "08:00 Tue: couldn't start. Halonic ran into a problem it can't explain yet.",
  );
  expect(skipName({ ...one, sentence }, now)).toBe(
    "Couldn't start at 08:00 Tue. This window can't run Briefing.",
  );
  const range = { ...one, from: at(10, 3, 7), count: 2, sentence };
  expect(skipName(range, now)).toBe(
    "Couldn't start from 07:00 to 08:00 Tue. This window can't run Briefing.",
  );
  expect(skipName({ ...one, reason: "busy" }, now)).toBeUndefined();
});

it("says queued times for one and for many", () => {
  const one = { from: at(10, 3, 14), to: at(10, 3, 14), count: 1 };
  expect(queuedSentence(one, now)).toBe("14:00 Tue: waiting to start when the last run is done");
  const many = { from: at(10, 2, 14), to: at(10, 3, 8), count: 99 };
  expect(queuedSentence({ ...many }, now)).toBe(
    "14:00 Mon to 08:00 Tue: 99 times waiting to start, one after another",
  );
});

it("says when a run started", () => {
  expect(runTime(at(10, 3, 9, 5), now)).toBe("09:05");
  expect(runTime(at(10, 2, 9, 5), now)).toBe("yesterday");
  expect(runTime(at(10, 1, 8, 12), now)).toBe("Sun 08:12");
  expect(runTime(at(9, 20, 8), now)).toBe("20 Oct");
});
