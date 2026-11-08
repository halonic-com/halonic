import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { readTestFileFacts } from "./test-file-facts.ts";

function kinds(text: string): string[] {
  return readTestFileFacts("a.test.ts", text).skips.map((use) => use.kind);
}

verifies("check.guard-skips", () => {
  test.each([
    ['test.skip("a", () => {});', ".skip"],
    ['it.only("a", () => {});', ".only"],
    ['test.todo("a");', ".todo"],
    ['describe.skipIf(ci)("a", () => {});', ".skipIf"],
    ['test.runIf(ci)("a", () => {});', ".runIf"],
    ['test.fails("a", () => {});', ".fails"],
    ['test.concurrent.skip("a", () => {});', ".skip"],
    ['test.each([1]).only("a %i", () => {});', ".only"],
    ['test("a", (ctx) => { ctx.skip(); });', "ctx.skip()"],
    ['test("a", ({ skip }) => { skip(); });', "skip()"],
    ['test("a", { retry: 2 }, () => {});', "retry option"],
    ['test("a", { skip: true }, () => {});', "skip option"],
    ["export default defineConfig({ test: { retry: 3 } });", "retry option"],
    ["export default mergeConfig(preset, { test: { retry: 2 } });", "retry option"],
  ])("finds %s", (text, kind) => {
    expect(kinds(text)).toEqual([kind]);
  });

  test.each([
    'test("a", () => { expect(run({ retry: 2 })).toBe(1); });',
    'test("a", () => { stream.skipWhile(x); });',
    'verifies("workflow.a", () => { test("b", () => {}); });',
    'test("a", () => { expect(run({ test: { retry: 2 } })).toBe(1); });',
  ])("finds nothing in %s", (text) => {
    expect(kinds(text)).toEqual([]);
  });

  test("counts a test: { retry } anywhere in a Vitest config file", () => {
    const text = "export default { test: { retry: 2 } };\n";
    const configKinds = readTestFileFacts("vitest.config.ts", text).skips.map((use) => use.kind);
    expect(configKinds).toEqual(["retry option"]);
  });

  test("counts a test: { retry } anywhere in the shared preset", () => {
    const text = "const extra = { test: { retry: 2 } };\n";
    const presetKinds = readTestFileFacts("tooling/config/src/vitest-preset.ts", text).skips.map(
      (use) => use.kind,
    );
    expect(presetKinds).toEqual(["retry option"]);
  });
});

verifies("check.guard-mocks", () => {
  test("reads the module of vi.mock and vi.doMock, as a string or an import()", () => {
    const text = 'vi.mock("./a.ts");\nvi.doMock(import("@halonicjs/std"));\nvi.fn();\n';
    expect(readTestFileFacts("a.test.ts", text).mocks).toEqual([
      { specifier: "./a.ts", line: 1 },
      { specifier: "@halonicjs/std", line: 2 },
    ]);
  });
});
