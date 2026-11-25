import { describe, expect, it } from "vitest";
import type { NearbyComputer } from "../phone/nearby-computers.ts";
import { FakeNearbyComputers, nearby } from "./nearby-computers.ts";

describe("FakeNearbyComputers", () => {
  it("sends an empty list first, then each pushed list sorted by name, until stopped", async () => {
    const fake = new FakeNearbyComputers();
    const lists: (readonly NearbyComputer[])[] = [];
    expect(await fake.browse((computers) => lists.push(computers))).toEqual({ kind: "browsing" });
    fake.push([nearby("Tim's laptop"), nearby("Attic desktop")]);
    await fake.stop();
    fake.push([nearby("Late one")]);
    expect(lists).toEqual([[], [nearby("Attic desktop"), nearby("Tim's laptop")]]);
    expect(fake.browsing).toBe(false);
    expect(fake.calls).toEqual(["browse", "stop"]);
  });

  it("sends no list to a browse that didn't start, or that a newer one replaced", async () => {
    const fake = new FakeNearbyComputers();
    fake.nextStart = { kind: "no-local-network", askAgain: false };
    const refused: (readonly NearbyComputer[])[] = [];
    await fake.browse((computers) => refused.push(computers));
    fake.push([nearby("Tim's laptop")]);
    expect(refused).toEqual([]);
    fake.nextStart = { kind: "browsing" };
    const first: (readonly NearbyComputer[])[] = [];
    await fake.browse((computers) => first.push(computers));
    await fake.browse(() => undefined);
    fake.push([nearby("Tim's laptop")]);
    expect(first).toEqual([[]]);
    expect(fake.browsing).toBe(true);
  });
});
