import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, test } from "vitest";

// These tests start a real Vitest run through the shared preset, so a floor
// that matches no files (and so passes on nothing) can't hide.
const toolingRoot = join(import.meta.dirname, "..", "..", "..");
const presetPath = join(toolingRoot, "config", "src", "vitest-preset.ts");
const vitestFolder = realpathSync(join(toolingRoot, "check", "node_modules", "vitest"));
const coverageFolder = realpathSync(
  join(toolingRoot, "config", "node_modules", "@vitest", "coverage-v8"),
);

/** A function of ten lines; a test that calls it covers all of them. */
function body(name: string): string {
  const lines = Array.from({ length: 10 }, (_, index) => `  total += ${index};`);
  return `export function ${name}(): number {\n  let total = 0;\n${lines.join("\n")}\n  return total;\n}\n`;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

interface Fixture {
  /** Functions in the measured package; the adapter's test calls only `reached`. */
  readonly contractFunctions: readonly string[];
  /** Functions in the adapter itself; its test calls only `own`. */
  readonly adapterFunctions: readonly string[];
}

/**
 * Writes an acme-style repo with a testing package measured in an adapter's
 * run, then runs the adapter's tests the way `pnpm test` does.
 */
function runAdapter(fixture: Fixture): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), "halonic-measured-in-"));
  roots.push(root);
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const link = (target: string, path: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path), "dir");
  };
  write(
    "packages/testing/suites/package.json",
    JSON.stringify({
      name: "@acme/suites",
      type: "module",
      exports: { ".": "./src/index.ts" },
      halonic: { coverage: { lines: 80, measuredIn: "@acme/adapter" } },
    }),
  );
  write("packages/testing/suites/src/index.ts", fixture.contractFunctions.map(body).join("\n"));
  const adapter = "packages/adapters/adapter";
  write(
    `${adapter}/package.json`,
    JSON.stringify({
      name: "@acme/adapter",
      type: "module",
      devDependencies: { "@acme/suites": "workspace:*" },
      halonic: { coverage: { lines: 80 } },
    }),
  );
  write(`${adapter}/src/index.ts`, fixture.adapterFunctions.map(body).join("\n"));
  write(
    `${adapter}/src/index.test.ts`,
    [
      'import { reached } from "@acme/suites";',
      'import { expect, test } from "vitest";',
      'import { own } from "./index.ts";',
      'test("runs", () => {\n  expect(reached() + own()).toBe(90);\n});\n',
    ].join("\n"),
  );
  write(
    `${adapter}/vitest.config.ts`,
    `import { definePackageTestConfig } from ${JSON.stringify(presetPath)};\nexport default definePackageTestConfig();\n`,
  );
  link("../../../../testing/suites", `${adapter}/node_modules/@acme/suites`);
  link(vitestFolder, `${adapter}/node_modules/vitest`);
  link(coverageFolder, `${adapter}/node_modules/@vitest/coverage-v8`);
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST") && key !== "CI"),
  );
  const result = spawnSync(process.execPath, [join(vitestFolder, "vitest.mjs"), "run"], {
    cwd: join(root, adapter),
    env: environment,
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

verifies("check.coverage-measured-in", () => {
  test("passes when both folders reach their floors", { timeout: 120_000 }, () => {
    const run = runAdapter({ contractFunctions: ["reached"], adapterFunctions: ["own"] });
    expect(run.output).not.toContain("ERROR: Coverage");
    expect(run.status).toBe(0);
  });

  test("fails the adapter's run when the measured package is below its floor", {
    timeout: 120_000,
  }, () => {
    const run = runAdapter({
      contractFunctions: ["reached", "missedOne", "missedTwo"],
      adapterFunctions: ["own"],
    });
    expect(run.output).toMatch(
      /ERROR: Coverage for lines \([\d.]+%\) does not meet "\.\.\/\.\.\/testing\/suites\/src\/\*\*" threshold \(80%\)/,
    );
    expect(run.output).not.toContain('"src/**" threshold');
    expect(run.status).toBe(1);
  });

  test("holds the adapter's own src to its own floor, not flattered by the other folder", {
    timeout: 120_000,
  }, () => {
    const run = runAdapter({
      contractFunctions: ["reached"],
      adapterFunctions: ["own", "missedOne", "missedTwo"],
    });
    expect(run.output).toMatch(
      /ERROR: Coverage for lines \([\d.]+%\) does not meet "src\/\*\*" threshold \(80%\)/,
    );
    expect(run.output).not.toContain("global threshold");
    expect(run.status).toBe(1);
  });
});
