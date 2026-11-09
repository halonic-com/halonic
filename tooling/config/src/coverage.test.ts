import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { coverageSettings, readCoverageFloor } from "./coverage.ts";

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

describe("coverageSettings", () => {
  /** A repo with a testing package linked into an adapter, as pnpm does it. */
  function repoWith(suites: unknown, options: { withSource?: boolean } = {}): string {
    const root = mkdtempSync(join(tmpdir(), "halonic-coverage-"));
    folders.push(root);
    const suitesFolder = join(root, "packages", "testing", "suites");
    const adapter = join(root, "packages", "adapters", "adapter");
    mkdirSync(join(suitesFolder, options.withSource === false ? "lib" : "src"), {
      recursive: true,
    });
    writeFileSync(join(suitesFolder, "package.json"), JSON.stringify(suites));
    mkdirSync(join(adapter, "node_modules", "@acme"), { recursive: true });
    writeFileSync(
      join(adapter, "package.json"),
      JSON.stringify({
        name: "@acme/adapter",
        devDependencies: { "@acme/suites": "workspace:*", "@acme/missing": "workspace:*" },
        halonic: { coverage: { lines: 80 } },
      }),
    );
    symlinkSync(join(suitesFolder), join(adapter, "node_modules", "@acme", "suites"), "dir");
    return adapter;
  }
  const measured = {
    name: "@acme/suites",
    halonic: { coverage: { lines: 85, measuredIn: "@acme/adapter" } },
  };

  it("measures only the package's own src, against one floor, by default", () => {
    const settings = coverageSettings(packageWith({ halonic: { coverage: { lines: 90 } } }));
    expect(settings.include).toEqual(["src/**/*.ts", "src/**/*.tsx"]);
    expect(settings.allowExternal).toBe(false);
    expect(settings.thresholds).toEqual({ lines: 90 });
  });

  it("measures a dependency marked measuredIn here, each folder against its own floor", () => {
    const settings = coverageSettings(repoWith(measured));
    expect(settings.allowExternal).toBe(true);
    expect(settings.thresholds).toEqual({
      "src/**": { lines: 80 },
      "../../testing/suites/src/**": { lines: 85 },
    });
    expect(settings.include).toContain("../../testing/suites/src/**/*.ts");
    expect(settings.exclude).toContain("../../testing/suites/src/**/*.test.ts");
    expect(settings.exclude).toContain("src/**/*.test.ts");
  });

  it("ignores a dependency measured in another package", () => {
    const elsewhere = {
      ...measured,
      halonic: { coverage: { lines: 85, measuredIn: "@acme/other" } },
    };
    expect(coverageSettings(repoWith(elsewhere)).thresholds).toEqual({ lines: 80 });
  });

  it("measures the folder's own src with no floor when it has no package.json", () => {
    const settings = coverageSettings(join(tmpdir(), "halonic-coverage-missing"));
    expect(settings.allowExternal).toBe(false);
    expect(settings.thresholds).toEqual({});
  });

  it("drops the floor from the package's own run when it is measured elsewhere", () => {
    expect(coverageSettings(packageWith(measured)).thresholds).toEqual({});
  });

  it("refuses a measured dependency with no src, whose floor would measure nothing", () => {
    expect(() => coverageSettings(repoWith(measured, { withSource: false }))).toThrow(
      "@acme/suites is measured in @acme/adapter's run, but has no src folder.",
    );
  });
});
