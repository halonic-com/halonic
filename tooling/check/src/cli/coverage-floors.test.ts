import { describe, expect, it } from "vitest";
import {
  type FloorsByManifest,
  loweredFloorMessage,
  loweredFloors,
  readFloor,
} from "../lib/coverage-floor-diff.ts";

const floors = (entries: Record<string, { lines?: number; branches?: number }>): FloorsByManifest =>
  new Map(Object.entries(entries));

describe("readFloor", () => {
  it("reads lines and branches", () => {
    const text = JSON.stringify({ halonic: { coverage: { lines: 90, branches: 85 } } });
    expect(readFloor(text)).toEqual({ lines: 90, branches: 85 });
  });

  it("returns undefined without a floor or with broken JSON", () => {
    expect(readFloor("{}")).toBeUndefined();
    expect(readFloor("{")).toBeUndefined();
    expect(readFloor(JSON.stringify({ halonic: { coverage: [] } }))).toBeUndefined();
  });

  it("ignores values that aren't numbers", () => {
    expect(readFloor(JSON.stringify({ halonic: { coverage: { lines: "90" } } }))).toEqual({});
  });
});

describe("loweredFloors", () => {
  const base = floors({ "a/package.json": { lines: 90, branches: 85 } });

  it("accepts equal and higher floors", () => {
    expect(loweredFloors(base, floors({ "a/package.json": { lines: 90, branches: 90 } }))).toEqual(
      [],
    );
  });

  it("reports each value that went down", () => {
    expect(loweredFloors(base, floors({ "a/package.json": { lines: 89, branches: 80 } }))).toEqual([
      { manifest: "a/package.json", key: "lines", before: 90, after: 89 },
      { manifest: "a/package.json", key: "branches", before: 85, after: 80 },
    ]);
  });

  it("treats a removed value as lowered", () => {
    expect(loweredFloors(base, floors({ "a/package.json": { lines: 90 } }))).toEqual([
      { manifest: "a/package.json", key: "branches", before: 85, after: undefined },
    ]);
  });

  it("lets new packages, deleted packages and packages with no floor on the target pass", () => {
    expect(loweredFloors(base, floors({ "b/package.json": { lines: 1 } }))).toEqual([]);
    expect(
      loweredFloors(floors({ "c/package.json": {} }), floors({ "c/package.json": { lines: 1 } })),
    ).toEqual([]);
  });

  it("allows a branches floor to be added", () => {
    expect(loweredFloors(floors({ "a/package.json": { lines: 80 } }), base)).toEqual([]);
  });
});

describe("loweredFloorMessage", () => {
  it("names the package, the values and the label", () => {
    const message = loweredFloorMessage([
      { manifest: "a/package.json", key: "lines", before: 90, after: 89 },
    ]);
    expect(message).toContain("a/package.json: halonic.coverage.lines went from 90 to 89");
    expect(message).toContain('"coverage-floor-lowered" label');
  });
});
