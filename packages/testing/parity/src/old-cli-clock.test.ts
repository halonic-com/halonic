import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { fixClockAndRandom } from "./old-cli-clock.ts";

const at = "2026-01-01T00:00:00.000Z";
const fixed = Date.parse(at);

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

verifies("parity.runner-records-cli-output", () => {
  it("stands the clock still, and leaves dates built from a value alone", () => {
    const RealDate = Date;
    restore = fixClockAndRandom(at);
    expect(Date.now()).toBe(fixed);
    expect(new Date().toISOString()).toBe(at);
    expect(new Date(0).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(new Date(2026, 0, 3).getDate()).toBe(3);
    expect((Date as unknown as () => string)()).toBe(new RealDate(fixed).toString());
    expect(new Date()).toBeInstanceOf(Date);
    expect(new Date()).toBeInstanceOf(RealDate);
    expect(Date.parse("2026-01-03T00:00:00Z")).toBe(fixed + 2 * 86_400_000);
  });

  it("counts the random source up from 1, into the last four bytes", () => {
    restore = fixClockAndRandom(at);
    const four = crypto.getRandomValues(new Uint8Array(4));
    expect([...four]).toEqual([0, 0, 0, 1]);
    const six = crypto.getRandomValues(new Uint8Array(6));
    expect([...six]).toEqual([0, 0, 0, 0, 0, 2]);
    expect([...crypto.getRandomValues(new Uint8Array(2))]).toEqual([0, 3]);
    expect(crypto.randomUUID()).toBe("00000000-0000-4000-8000-000000000004");
    expect(Math.random()).toBe(0.000005);
  });

  it("writes counts above 255 over more than one byte", () => {
    restore = fixClockAndRandom(at);
    for (let i = 0; i < 299; i++) {
      Math.random();
    }
    expect([...crypto.getRandomValues(new Uint8Array(4))]).toEqual([0, 0, 1, 44]);
  });

  it("gives back the real clock and random source", () => {
    const real = [Date, crypto.getRandomValues, crypto.randomUUID, Math.random];
    fixClockAndRandom(at)();
    expect([Date, crypto.getRandomValues, crypto.randomUUID, Math.random]).toEqual(real);
    expect(Date.now()).not.toBe(fixed);
  });

  it("refuses a time it can't read", () => {
    expect(() => fixClockAndRandom("soon")).toThrow('"soon" is not a time to fix the clock at');
  });

  it("is fixed by the preload at the time PARITY_FIXED_TIME names", async () => {
    process.env["PARITY_FIXED_TIME"] = at;
    try {
      const preload = await import("./old-cli-preload.ts");
      restore = preload.restore;
      expect(Date.now()).toBe(fixed);
    } finally {
      delete process.env["PARITY_FIXED_TIME"];
    }
  });
});
