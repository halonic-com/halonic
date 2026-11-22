import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { readSeatsSettings } from "./settings.ts";

// Made-up seats only: no real folder, account or company.
verifies("paperclip.seats-settings", () => {
  test("keeps a seat with its folder, account and reset group", () => {
    const settings = readSeatsSettings({
      seats: [
        {
          id: "seat-a",
          role: "pool",
          configDir: "/srv/seats/seat-a",
          account: "a@acme.test",
          resetGroup: "g1",
        },
        { id: "seat-b", role: "paid-api", configDir: "/srv/seats/seat-b", account: "" },
      ],
      movesEnabled: true,
    });
    expect(settings).toEqual({
      seats: [
        {
          id: "seat-a",
          role: "pool",
          configDir: "/srv/seats/seat-a",
          account: "a@acme.test",
          resetGroup: "g1",
        },
        {
          id: "seat-b",
          role: "paid-api",
          configDir: "/srv/seats/seat-b",
          account: undefined,
          resetGroup: undefined,
        },
      ],
      movesEnabled: true,
    });
  });

  test("keeps the first seat with an id and leaves bad entries out", () => {
    const settings = readSeatsSettings({
      seats: [
        { id: "seat-a", role: "pool", configDir: "/srv/one" },
        { id: "seat-a", role: "reserve", configDir: "/srv/two" },
        { id: "seat-b", role: "pool" },
        { id: "Seat C", role: "pool", configDir: "/srv/three" },
        { id: "seat-d", role: "owner", configDir: "/srv/four" },
        "seat-e",
      ],
      movesEnabled: "yes",
    });
    expect(settings.seats.map((seat) => [seat.id, seat.configDir])).toEqual([
      ["seat-a", "/srv/one"],
    ]);
    expect(settings.movesEnabled).toBe(false);
  });

  test("has no seats and moving agents off when nothing is set", () => {
    expect(readSeatsSettings({})).toEqual({ seats: [], movesEnabled: false });
  });
});
