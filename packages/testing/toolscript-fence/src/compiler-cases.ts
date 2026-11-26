import { verifies } from "@halonicjs/testing-spec";
import { expect } from "vitest";
import { fenceIt } from "./fence-case.ts";
import { type MakeToolScriptIsolate, runScript, script } from "./harness.ts";

/** Every path to the compiler a script could take (ADR T4 fence list). */
export const compilerPaths = [
  "eval('1')",
  "(0, eval)('1')",
  "globalThis['ev' + 'al']('1')",
  "Function('return 1')",
  "new Function('return 1')",
  "(() => 1).constructor('return 1')",
  "({ m() {} }).m.constructor('return 1')",
  "(class A {}).constructor('return 1')",
  "(function () {}).bind(null).constructor('return 1')",
  "(async () => {}).constructor('return 1')",
  "(function* () {}).constructor('yield 1')",
  "(async function* () {}).constructor('')",
  "Reflect.construct(Function, ['return 1'])",
  "Object.getPrototypeOf(function* () {}).constructor('')",
  "Object.getPrototypeOf((function* () {})()).constructor.constructor('')",
  "[].values().constructor.constructor('')",
  "eval.constructor('return 1')",
] as const;

/** A script that tries each path and gives, for each, whether it ran or threw. */
function tryEveryPath(before = ""): string {
  const attempts = compilerPaths
    .map((path) => `try { ${path}; results.push("ran"); } catch { results.push("threw"); }`)
    .join("\n");
  return script(`${before}\nconst results = [];\n${attempts}\nreturn results;`);
}

const tamper = `
const slots = [
  [globalThis, "eval"],
  [globalThis, "Function"],
  [Function.prototype, "constructor"],
  [Object.getPrototypeOf(async function () {}), "constructor"],
  [Object.getPrototypeOf(function* () {}), "constructor"],
  [Object.getPrototypeOf(async function* () {}), "constructor"],
];
const replacement = function () { return 1; };
for (const [owner, key] of slots) {
  try { Object.defineProperty(owner, key, { value: replacement }); } catch {}
  try { delete owner[key]; } catch {}
  try { owner[key] = replacement; } catch {}
}`;

/** The eval and constructor paths, dynamic `import()` and module imports. */
export function compilerCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  verifies("toolscript-fence.no-compiler", () => {
    it("refuses every path to the compiler", async () => {
      const result = await runScript(make, tryEveryPath());
      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.output).toEqual(compilerPaths.map(() => "threw"));
    });

    it("still refuses every path after the script tries to redefine, delete or assign them", async () => {
      const result = await runScript(make, tryEveryPath(tamper));
      expect(result.ok && result.output).toEqual(compilerPaths.map(() => "threw"));
    });

    it("keeps plain, async and generator functions working", async () => {
      const code = script(`
        function* numbers() { yield 1; yield 2; }
        const twice = async (n) => n * 2;
        return [...numbers(), await twice(3), [1, 2].map((n) => n + 1)];`);
      const result = await runScript(make, code);
      expect(result.ok && result.output).toEqual([1, 2, 6, [2, 3]]);
    });

    it("refuses import() of a data: URL or any module name", async () => {
      const code = script(`
        const results = [];
        for (const name of ["data:text/javascript,export default 1", "std", "os", "./helper.js", "https://acme.example/x.js"]) {
          try { await import(name); results.push("loaded"); } catch { results.push("refused"); }
        }
        return results;`);
      const result = await runScript(make, code);
      expect(result.ok && result.output).toEqual([
        "refused",
        "refused",
        "refused",
        "refused",
        "refused",
      ]);
    });

    it("refuses a static import", async () => {
      const code = `import * as std from "std";\n${script("return typeof std;")}`;
      const result = await runScript(make, code);
      expect(result.ok).toBe(false);
    });
  });
}
