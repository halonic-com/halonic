import { matcherNames } from "../worker/expect.ts";
import { describe, it, test, vi } from "../worker/vitest-shim.ts";

/**
 * The properties each of the shim's `vitest` exports has, read from the
 * exports themselves: `vi.waitFor` today, and nothing on `it`, `test` or
 * `describe`. A suite's `it.each` or `vi.fn` is missing until the shim
 * adds it.
 */
const shimProperties: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries({ describe, it, test, vi }).map(([name, value]) => [name, Object.keys(value)]),
);

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
// Not after a dot or a name character, so `/x/.test(…)` and `context.it` don't count.
const shimProperty = new RegExp(
  String.raw`(?<![.\w$])(${[...shimProperties.keys()].join("|")})\.(\w+)`,
  "g",
);

/**
 * Finds the matchers, `expect.X` helpers, modifiers (`.rejects`,
 * `.resolves`) and `it.X`, `test.X`, `describe.X` and `vi.X` properties a
 * test file uses that the vitest shim doesn't have. esbuild already checks
 * the named imports; these are property reads, so this reads the source.
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
  for (const [, owner = "", property = ""] of source.matchAll(shimProperty)) {
    if (!shimProperties.get(owner)?.includes(property)) {
      missing.add(`${owner}.${property}`);
    }
  }
  return [...missing].sort();
}
