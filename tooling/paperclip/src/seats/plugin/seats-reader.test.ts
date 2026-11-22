import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { SeatReadOutcome, SeatToRead } from "../read/read-seat.ts";
import type { SeatReading } from "../records.ts";
import { SeatsReader } from "./seats-reader.ts";
import { readSeatsSettings, type SeatSetting } from "./settings.ts";
import type { SeatsStore } from "./store.ts";

// Made-up seats only: no real folder or account.
const seatA = { id: "seat-a", role: "pool", configDir: "/srv/seats/a", account: "a@acme.test" };
const seatB = { id: "seat-b", role: "pool", configDir: "/srv/seats/b" };

function seats(...entries: object[]): readonly SeatSetting[] {
  return readSeatsSettings({ seats: entries }).seats;
}

function setup(start: string) {
  let now = new Date(start);
  const stored: SeatReading[] = [];
  const removed: string[] = [];
  const reads: SeatToRead[] = [];
  const store: SeatsStore = {
    recordEvent: async () => undefined,
    recordReading: async (reading) => void stored.push(reading),
    removeOld: async (at) => void removed.push(at.toISOString()),
  };
  const read = async (seat: SeatToRead): Promise<SeatReadOutcome> => {
    reads.push(seat);
    const reading: SeatReading = {
      seatId: seat.id,
      at: now.toISOString(),
      error: undefined,
      session: { usedPercent: 10, resetsAt: undefined },
      week: undefined,
      weekByModel: {},
    };
    return { reading, signIn: undefined };
  };
  const reader = new SeatsReader({ read, store, now: () => now });
  const at = (iso: string) => {
    now = new Date(iso);
  };
  return { reader, stored, removed, reads, at };
}

verifies("paperclip.seats-read-store", () => {
  test("stores each due seat's reading and plans the next one 10 minutes later", async () => {
    const { reader, stored, at } = setup("2026-11-22T10:00:00.000Z");
    const both = seats(seatA, seatB);
    expect((await reader.tick(both)).read).toBe(0);

    at("2026-11-22T10:02:00.000Z");
    const result = await reader.tick(both);

    expect(result).toEqual({ skipped: false, read: 2, errors: [] });
    expect(stored.map((reading) => reading.seatId)).toEqual(["seat-a", "seat-b"]);
    expect(reader.status(both).map((status) => status.nextReadAt)).toEqual([
      "2026-11-22T10:11:00.000Z",
      "2026-11-22T10:12:00.000Z",
    ]);
  });

  test("a seat moved in the list starts fresh at its new minute; a removed one is dropped", async () => {
    const { reader, at } = setup("2026-11-22T10:00:00.000Z");
    await reader.tick(seats(seatA, seatB));
    at("2026-11-22T10:05:00.000Z");
    await reader.tick(seats(seatA, seatB));

    const moved = seats(seatB);
    await reader.tick(moved);

    expect(reader.status(seats(seatA, seatB)).map((status) => status.seatId)).toEqual(["seat-b"]);
    expect(reader.status(moved)[0]).toMatchObject({
      nextReadAt: "2026-11-22T10:11:00.000Z",
      lastReadAt: undefined,
    });
  });

  test("removes old rows at the first tick, then at most once an hour", async () => {
    const { reader, removed, at } = setup("2026-11-22T10:00:00.000Z");
    const one = seats(seatA);
    for (const time of ["10:00", "10:30", "11:00"]) {
      at(`2026-11-22T${time}:00.000Z`);
      await reader.tick(one);
    }
    expect(removed).toEqual(["2026-11-22T10:00:00.000Z", "2026-11-22T11:00:00.000Z"]);
  });

  test("the status carries no folder or account, and says when the worker started", async () => {
    const { reader, at } = setup("2026-11-22T10:00:00.000Z");
    const one = seats(seatA);
    await reader.tick(one);
    at("2026-11-22T10:01:00.000Z");
    await reader.tick(one);

    expect(reader.startedAt).toBe("2026-11-22T10:00:00.000Z");
    expect(reader.status(one)[0]).toMatchObject({ readingAgeMs: 0, lastError: undefined });
    expect(JSON.stringify(reader.status(one))).not.toMatch(/srv|acme\.test/);
  });
});
