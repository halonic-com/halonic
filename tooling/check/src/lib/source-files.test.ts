import { describe, expect, it } from "vitest";
import { isTestFile, readSourceFacts, splitBareSpecifier } from "./source-files.ts";

/** The specifiers the parser finds in a TypeScript file. */
function specifiers(text: string, fileName = "a.ts"): string[] {
  return readSourceFacts(fileName, text).imports.map((reference) => reference.specifier);
}

describe("readSourceFacts: imports", () => {
  it("finds static imports, including side-effect and namespace imports", () => {
    const text = 'import a from "a";\nimport "b";\nimport * as c from "c";\n';
    expect(specifiers(text)).toEqual(["a", "b", "c"]);
  });

  it("finds type-only imports and exports", () => {
    const text = [
      'import type { A } from "a";',
      'import { type B } from "b";',
      'export type { C } from "c";',
      'type D = import("d").D;',
      "",
    ].join("\n");
    expect(specifiers(text)).toEqual(["a", "b", "c", "d"]);
  });

  it("finds export-from in every form", () => {
    const text = 'export * from "a";\nexport * as b from "b";\nexport { c } from "c";\n';
    expect(specifiers(text)).toEqual(["a", "b", "c"]);
  });

  it("ignores exports without a module", () => {
    expect(specifiers("const a = 1;\nexport { a };\nexport default a;\n")).toEqual([]);
  });

  it("finds dynamic imports with a literal specifier", () => {
    const text = 'const a = await import("a");\nconst b = import(`b`);\n';
    expect(specifiers(text)).toEqual(["a", "b"]);
  });

  it("skips dynamic imports and requires it can't resolve", () => {
    const text = 'const name = "a";\nawait import(name);\nrequire("x" + name);\nrequire();\n';
    expect(specifiers(text)).toEqual([]);
  });

  it("finds require calls, in JavaScript and in TypeScript", () => {
    expect(specifiers('const a = require("a");\n', "a.cjs")).toEqual(["a"]);
    expect(specifiers('const fs = require("node:fs");\n', "a.ts")).toEqual(["node:fs"]);
    expect(specifiers('import a = require("a");\n')).toEqual(["a"]);
  });

  it("doesn't take other calls or a method named require for imports", () => {
    expect(specifiers('load("a");\nmodule.require("b");\n')).toEqual([]);
  });

  it("finds imports nested inside functions", () => {
    const text = 'export async function f() {\n  return import("a");\n}\n';
    expect(readSourceFacts("a.ts", text).imports).toEqual([{ specifier: "a", line: 2 }]);
  });

  it("reports the line of each specifier", () => {
    const text = '// header\n\nimport {\n  a,\n} from "a";\nexport * from "b";\n';
    expect(readSourceFacts("a.ts", text).imports).toEqual([
      { specifier: "a", line: 5 },
      { specifier: "b", line: 6 },
    ]);
  });

  it("parses JSX in .tsx files", () => {
    const text = 'import { A } from "a";\nexport const b = <A prop="x" />;\n';
    expect(specifiers(text, "b.tsx")).toEqual(["a"]);
  });
});

describe("readSourceFacts: functions", () => {
  it("names functions, methods and arrow functions and counts their lines", () => {
    const text = [
      "function one() {",
      "  return 1;",
      "}",
      "const two = () => {",
      "  return 2;",
      "};",
      "class C {",
      "  constructor() {}",
      "  three() {",
      "    return 3;",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(readSourceFacts("a.ts", text).functions).toEqual([
      { name: "one", line: 1, lineCount: 3 },
      { name: "two", line: 4, lineCount: 3 },
      { name: "constructor", line: 8, lineCount: 1 },
      { name: "three", line: 9, lineCount: 3 },
    ]);
  });

  it("skips declarations without a body", () => {
    expect(readSourceFacts("a.ts", "declare function f(): void;\n").functions).toEqual([]);
  });
});

describe("splitBareSpecifier", () => {
  it("splits a package name from its subpath", () => {
    expect(splitBareSpecifier("@halonicjs/std")).toEqual({ name: "@halonicjs/std", subpath: "." });
    expect(splitBareSpecifier("@halonicjs/studio-feature-agents/api")).toEqual({
      name: "@halonicjs/studio-feature-agents",
      subpath: "./api",
    });
    expect(splitBareSpecifier("zod/v4/core")).toEqual({ name: "zod", subpath: "./v4/core" });
  });
});

describe("isTestFile", () => {
  it("knows test files by name, not by folder", () => {
    expect(isTestFile("src/a.test.ts")).toBe(true);
    expect(isTestFile("src/a.spec.tsx")).toBe(true);
    expect(isTestFile("src/test/fixture.ts")).toBe(false);
    expect(isTestFile("tests/a.ts")).toBe(false);
    expect(isTestFile("src/latest/a.ts")).toBe(false);
    expect(isTestFile("src/contest.ts")).toBe(false);
  });
});
