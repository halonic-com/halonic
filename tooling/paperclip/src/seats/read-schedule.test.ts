import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { nextReadAt, readOffsetMs } from "./read-schedule.ts";

const minute = 60_000;
const seats = ["seat-a", "seat-b", "seat-c"];

verifies("paperclip.seats-read-schedule", () => {
  test("seats get a minute each, from minute 1, by their place in the list", () => {
    expect(seats.map((seat) => readOffsetMs(seats, seat))).toEqual([
      1 * minute,
      2 * minute,
      3 * minute,
    ]);
  });

  test("adding a seat at the end moves no other seat", () => {
    const more = [...seats, "seat-d"];
    expect(seats.map((seat) => readOffsetMs(more, seat))).toEqual(
      seats.map((seat) => readOffsetMs(seats, seat)),
    );
    expect(readOffsetMs(more, "seat-d")).toBe(4 * minute);
  });

  test("the ninth seat shares the first seat's minute, and an unknown seat has none", () => {
    const nine = Array.from({ length: 9 }, (_, index) => `seat-${index}`);
    expect(readOffsetMs(nine, "seat-8")).toBe(1 * minute);
    expect(readOffsetMs(seats, "seat-z")).toBeUndefined();
  });

  test("the next read is at the offset in this bucket, or the next one once it has passed", () => {
    expect(nextReadAt("2026-11-22T09:00:30.000Z", 2 * minute)).toBe("2026-11-22T09:02:00.000Z");
    expect(nextReadAt("2026-11-22T09:02:00.000Z", 2 * minute)).toBe("2026-11-22T09:12:00.000Z");
    expect(nextReadAt("2026-11-22T09:59:00.000Z", 2 * minute)).toBe("2026-11-22T10:02:00.000Z");
  });
});
