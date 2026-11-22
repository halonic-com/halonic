import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { currentWindow, project, type WindowSample } from "./projection.ts";

const reset = "2026-11-22T20:00:00.000Z";

function sample(
  at: string,
  usedPercent: number,
  resetsAt: string | undefined = reset,
): WindowSample {
  return { at: `2026-11-22T${at}:00.000Z`, usedPercent, resetsAt };
}

verifies("paperclip.seats-projection", () => {
  test("a steady rate gives the time the window is full", () => {
    const samples = [sample("08:00", 20), sample("09:00", 30), sample("10:00", 40)];

    expect(project(samples, "2026-11-22T10:05:00.000Z")).toEqual({
      usedPercent: 40,
      percentPerHour: 10,
      fullAt: "2026-11-22T16:00:00.000Z",
    });
  });

  test("no full time when the window resets first", () => {
    const samples = [
      sample("08:00", 20, "2026-11-22T13:00:00.000Z"),
      sample("10:00", 40, "2026-11-22T13:00:00.000Z"),
    ];
    expect(project(samples, "2026-11-22T10:05:00.000Z")).toMatchObject({
      percentPerHour: 10,
      fullAt: undefined,
    });
  });

  test("only readings since the last reset count", () => {
    const samples = [
      sample("06:00", 70, "2026-11-22T07:00:00.000Z"),
      sample("06:50", 80, "2026-11-22T07:00:00.000Z"),
      sample("08:00", 5),
      sample("09:00", 15),
    ];

    expect(currentWindow(samples).map((each) => each.usedPercent)).toEqual([5, 15]);
    expect(project(samples, "2026-11-22T09:00:00.000Z").percentPerHour).toBe(10);
  });

  test("a drop in percent is a reset the readings missed", () => {
    const samples = [sample("08:00", 60), sample("09:00", 10), sample("10:00", 20)];
    expect(currentWindow(samples).map((each) => each.usedPercent)).toEqual([10, 20]);
  });

  test("readings less than 30 minutes apart give no rate", () => {
    const samples = [sample("10:00", 40), sample("10:20", 45)];
    expect(project(samples, "2026-11-22T10:20:00.000Z")).toEqual({
      usedPercent: 45,
      percentPerHour: undefined,
      fullAt: undefined,
    });
  });

  test("a window whose reset has passed counts as unused", () => {
    const samples = [sample("08:00", 70), sample("10:00", 90)];
    expect(project(samples, "2026-11-22T20:30:00.000Z")).toEqual({
      usedPercent: 0,
      percentPerHour: undefined,
      fullAt: undefined,
    });
  });

  test("a full window is full since its newest reading", () => {
    const samples = [sample("08:00", 90), sample("10:00", 100)];
    expect(project(samples, "2026-11-22T10:30:00.000Z").fullAt).toBe("2026-11-22T10:00:00.000Z");
  });

  test("a flat window and no readings have no full time", () => {
    expect(
      project([sample("08:00", 30), sample("10:00", 30)], "2026-11-22T10:00:00.000Z"),
    ).toMatchObject({
      percentPerHour: 0,
      fullAt: undefined,
    });
    expect(project([], "2026-11-22T10:00:00.000Z")).toEqual({
      usedPercent: 0,
      percentPerHour: undefined,
      fullAt: undefined,
    });
  });

  test("readings without a printed reset form one window together", () => {
    const samples = [sample("08:00", 10, undefined), sample("10:00", 30, undefined)];
    expect(project(samples, "2026-11-22T10:00:00.000Z")).toMatchObject({
      percentPerHour: 10,
      fullAt: "2026-11-22T17:00:00.000Z",
    });
  });
});
