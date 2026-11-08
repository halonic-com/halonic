import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCoverageFloor } from "./coverage.ts";

const folders: string[] = [];

function packageWith(manifest: unknown): string {
  const folder = mkdtempSync(join(tmpdir(), "halonic-coverage-"));
  folders.push(folder);
  writeFileSync(join(folder, "package.json"), JSON.stringify(manifest));
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("readCoverageFloor", () => {
  it("returns the floor from halonic.coverage", () => {
    const folder = packageWith({ halonic: { coverage: { lines: 90, branches: 85 } } });
    expect(readCoverageFloor(folder)).toEqual({ lines: 90, branches: 85 });
  });

  it("leaves out branches when the package sets only lines", () => {
    expect(readCoverageFloor(packageWith({ halonic: { coverage: { lines: 80 } } }))).toEqual({
      lines: 80,
    });
  });

  it("returns no thresholds when there is no floor or no package.json", () => {
    expect(readCoverageFloor(packageWith({ halonic: { layer: "core" } }))).toEqual({});
    expect(readCoverageFloor(packageWith({}))).toEqual({});
    expect(readCoverageFloor(join(tmpdir(), "halonic-coverage-missing"))).toEqual({});
  });

  it("ignores values that aren't numbers, which pnpm check reports", () => {
    const folder = packageWith({ halonic: { coverage: { lines: "90", branches: 85 } } });
    expect(readCoverageFloor(folder)).toEqual({ branches: 85 });
  });
});
