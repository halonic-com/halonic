import type { PairedPhone } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agoOf, pairedLine, seenLine } from "./phone-words.ts";

// Noon UTC is the same calendar day in every time zone.
const now = new Date("2026-11-19T12:00:00.000Z");
const pixel: PairedPhone = {
  id: "phone-1",
  name: "Pixel 8",
  platform: "android",
  pairedAt: "2026-11-14T12:00:00.000Z",
  connected: false,
};

verifies("remote.paired-phones", () => {
  it("says the platform and the day it paired, with the year only when it isn't this one", () => {
    expect(pairedLine(pixel, now)).toBe("Android · Paired 14 Nov");
    expect(
      pairedLine({ ...pixel, platform: "ios", pairedAt: "2025-11-03T12:00:00.000Z" }, now),
    ).toBe("iOS · Paired 3 Nov 2025");
  });

  it("says Connected now, Last seen, or Not connected yet while remote is on", () => {
    expect(seenLine({ ...pixel, connected: true }, true, now)).toBe("Connected now");
    expect(seenLine({ ...pixel, lastSeenAt: "2026-11-17T12:00:00.000Z" }, true, now)).toBe(
      "Last seen 2 days ago",
    );
    expect(seenLine(pixel, true, now)).toBe("Not connected yet");
  });

  it("says Remote is off for every phone while it is off, connected or not", () => {
    expect(seenLine({ ...pixel, connected: true }, false, now)).toBe("Remote is off");
    expect(seenLine(pixel, false, now)).toBe("Remote is off");
  });

  it("counts minutes, hours and days, then gives the day from a week on", () => {
    const before = (ms: number) => new Date(now.getTime() - ms);
    expect(agoOf(before(30_000), now)).toBe("just now");
    expect(agoOf(before(60_000), now)).toBe("1 minute ago");
    expect(agoOf(before(5 * 60_000), now)).toBe("5 minutes ago");
    expect(agoOf(before(3_600_000), now)).toBe("1 hour ago");
    expect(agoOf(before(86_400_000), now)).toBe("1 day ago");
    expect(agoOf(before(6 * 86_400_000), now)).toBe("6 days ago");
    expect(agoOf(before(7 * 86_400_000), now)).toBe("12 Nov");
  });
});
