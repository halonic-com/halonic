import { matcherNames } from "../worker/expect.ts";

/**
 * The `to…` methods of JavaScript's own types, such as `toISOString` and
 * `toLowerCase`. A `.toX(` call in a suite that is none of these is a
 * matcher call.
 */
const builtInMethodNames: ReadonlySet<string> = new Set(
  [
    Object.prototype,
    String.prototype,
    Number.prototype,
    BigInt.prototype,
    Date.prototype,
    Array.prototype,
    RegExp.prototype,
    Uint8Array.prototype,
    Function.prototype,
    Error.prototype,
  ].flatMap((prototype) => Object.getOwnPropertyNames(prototype)),
);

/** The `expect.X` properties the shim's `expect` has. */
const expectPropertyNames: ReadonlySet<string> = new Set(["getState", "setState"]);

/**
 * Vitest's modifiers between `expect(…)` and the matcher that the shim
 * doesn't have yet. `.not` is the only one it has. Without this list,
 * `expect(promise).rejects.toBe(x)` would pass the build and only fail
 * inside workerd.
 */
const missingModifierNames: readonly string[] = ["rejects", "resolves"];

const matcherCall = /\.\s*(to[A-Z]\w*)\s*\(/g;
const expectProperty = /\bexpect\.(\w+)/g;
const modifier = new RegExp(String.raw`\.\s*(${missingModifierNames.join("|")})\b`, "g");

/**
 * Finds the matchers, `expect.X` helpers and modifiers (`.rejects`,
 * `.resolves`) a test file uses that the vitest shim doesn't have. The named imports are checked by esbuild
 * already; matchers are method calls, so this reads the source.
 *
 * @param source - the text of a test file that imports from `vitest`
 * @returns the missing names, sorted, without repeats
 */
export function missingShimApis(source: string): string[] {
  const missing = new Set<string>();
  for (const [, name = ""] of source.matchAll(matcherCall)) {
    if (!builtInMethodNames.has(name) && !matcherNames.includes(name)) {
      missing.add(name);
    }
  }
  for (const [, name = ""] of source.matchAll(expectProperty)) {
    if (!expectPropertyNames.has(name)) {
      missing.add(`expect.${name}`);
    }
  }
  for (const [, name = ""] of source.matchAll(modifier)) {
    missing.add(`.${name}`);
  }
  return [...missing].sort();
}
