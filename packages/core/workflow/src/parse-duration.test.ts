import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parseDuration } from "./parse-duration.ts";

verifies("workflow.parse-duration", () => {
  // Ported from "are transitions with after: they never fire on events and are
  // due a fixed time after entering" in the old test-runner's timers.test.ts at
  // 784f78d (the parseDuration line; the rest takes a Workflow and stays with
  // the machine port).
  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(1_800_000);
  });

  it("parses hours and days", () => {
    expect(parseDuration("4h")).toBe(14_400_000);
    expect(parseDuration("2d")).toBe(172_800_000);
  });
});

verifies("workflow.parse-duration-rejects-bad-durations", () => {
  it("rejects a zero duration", () => {
    expect(() => parseDuration("0m")).toThrow('Bad duration "0m"');
  });

  it("rejects a leading zero", () => {
    expect(() => parseDuration("05m")).toThrow('Bad duration "05m"');
  });

  it("rejects seconds and other units", () => {
    for (const text of ["30s", "1w", "30M", "1.5h", "+1h", "-1h"]) {
      expect(() => parseDuration(text), text).toThrow(`Bad duration "${text}"`);
    }
  });

  it("rejects a count or a unit on its own", () => {
    expect(() => parseDuration("m")).toThrow('Bad duration "m"');
    expect(() => parseDuration("30")).toThrow('Bad duration "30"');
  });

  it("rejects empty text", () => {
    expect(() => parseDuration("")).toThrow('Bad duration ""');
  });

  // Unlike parseEvery in @halonicjs/routines, which trims first.
  it("does not ignore spaces", () => {
    for (const text of [" 30m ", "30m\n", "30 m"]) {
      expect(() => parseDuration(text), JSON.stringify(text)).toThrow("Bad duration");
    }
  });
});
