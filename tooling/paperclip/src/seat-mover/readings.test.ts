import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { buildSeats, parseConnections, parseResetText, parseSeatReadings } from "./readings.ts";

const now = new Date("2026-11-26T10:00:00.000Z");

const readingsBody = (reading: Record<string, unknown> | null, connectionId = "c-1") => ({
  data: { seats: [{ name: "Noah", connectionId, reading }] },
});

const fresh = {
  at: "2026-11-26T09:47:00.000Z",
  error: null,
  usage: {
    session: { percent: 42, resets: "11:39am (UTC)" },
    week: { percent: 71, resets: "Nov 27, 8pm (UTC)" },
  },
};

const connection = (id: string, method = "subscription", status = "connected") => ({
  id,
  grantId: `g-${id}`,
  method,
  status,
});

verifies("paperclip.seat-mover-job", () => {
  test("a reset text is read in UTC, in the reading's year and on its day when it names none", () => {
    expect(parseResetText("Nov 27, 8pm (UTC)", fresh.at)).toBe("2026-11-27T20:00:00.000Z");
    expect(parseResetText("11:39am (UTC)", fresh.at)).toBe("2026-11-26T11:39:00.000Z");
    expect(parseResetText("Jan 2, 12am (UTC)", "2026-12-30T10:00:00.000Z")).toBe(
      "2027-01-02T00:00:00.000Z",
    );
    expect(parseResetText("Nov 27, 8pm (Europe/Amsterdam)", fresh.at)).toBeUndefined();
  });

  test("a fresh reading becomes the seat's use, named after its readings seat", () => {
    const readings = parseSeatReadings(readingsBody(fresh));
    const [seat] = buildSeats(
      parseConnections({ connections: [connection("c-1")] }),
      readings,
      new Map(),
      now,
      45,
    );
    expect(seat).toEqual({
      connectionId: "c-1",
      grantId: "g-c-1",
      name: "Noah",
      method: "subscription",
      reading: {
        sessionPercent: 42,
        weekPercent: 71,
        weekResetsAt: "2026-11-27T20:00:00.000Z",
        at: fresh.at,
      },
      quotaHit: false,
      connection: "connected",
    });
  });

  test("an old reading, an error or a missing window counts as no reading", () => {
    const connections = [connection("c-1")];
    for (const reading of [
      { ...fresh, at: "2026-11-26T09:00:00.000Z" },
      { ...fresh, error: "Could not read /usage" },
      { ...fresh, usage: { session: null, week: fresh.usage.week } },
      null,
    ]) {
      const [seat] = buildSeats(
        connections,
        parseSeatReadings(readingsBody(reading)),
        new Map(),
        now,
        45,
      );
      expect(seat?.reading).toBeUndefined();
    }
  });

  test("a provider_quota failure after the reading marks the seat full; one before it doesn't", () => {
    const readings = parseSeatReadings(readingsBody(fresh));
    const connections = [connection("c-1")];
    const after = new Map([["c-1", "2026-11-26T09:55:00.000Z"]]);
    const before = new Map([["c-1", "2026-11-26T09:30:00.000Z"]]);
    expect(buildSeats(connections, readings, after, now, 45)[0]?.quotaHit).toBe(true);
    expect(buildSeats(connections, readings, before, now, 45)[0]?.quotaHit).toBe(false);
  });

  test("a revoked connection stays as a seat that isn't connected; one without a status is unknown; one no readings seat names has no reading", () => {
    const connections = parseConnections({
      connections: [
        connection("c-1"),
        connection("c-2", "api_key"),
        connection("c-3", "subscription", "revoked"),
        { id: "c-4", grantId: "g-c-4", method: "subscription" },
      ],
    });
    const seats = buildSeats(
      connections,
      parseSeatReadings(readingsBody(fresh)),
      new Map(),
      now,
      45,
    );
    expect(
      seats.map((seat) => [seat.name, seat.method, seat.reading === undefined, seat.connection]),
    ).toEqual([
      ["c-2", "api_key", true, "connected"],
      ["c-3", "subscription", true, "not-connected"],
      ["c-4", "subscription", true, "unknown"],
      ["Noah", "subscription", false, "connected"],
    ]);
  });
});
