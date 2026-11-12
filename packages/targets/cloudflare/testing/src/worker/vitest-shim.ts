/**
 * Stands in for `vitest` inside the test Worker: the build points every
 * `import … from "vitest"` here. It exports only what the bundled contract
 * suites use, so a suite that imports anything else fails the build with
 * esbuild's "No matching export" error. Add the export here when a suite
 * needs it.
 */

import { AssertionError, type ShimExpect } from "./expect.ts";
import { type SuiteOptions, type TestFunction, TestRegistry } from "./registry.ts";

/** The one registry the Worker's suites register into. The Worker's fetch handler reads it. */
export const registry: TestRegistry = new TestRegistry();

/** Vitest's `describe(name, body)` or `describe(name, options, body)`. */
export function describe(
  name: string,
  optionsOrBody: SuiteOptions | (() => void),
  body?: () => void,
): void {
  if (typeof optionsOrBody === "function") {
    registry.describe(name, optionsOrBody);
    return;
  }
  if (body === undefined) {
    throw new Error(`describe("${name}") has options but no body.`);
  }
  registry.describe(name, body, optionsOrBody);
}

/** Vitest's `it(name, body)`. A timeout argument is accepted and ignored. */
export function it(name: string, body: TestFunction, _timeout?: number): void {
  registry.it(name, body);
}

/** Vitest's `test`, the same as {@link it}. */
export const test: typeof it = it;

/** Vitest's `beforeEach`. */
export function beforeEach(hook: TestFunction): void {
  registry.beforeEach(hook);
}

/** Vitest's `afterEach`. */
export function afterEach(hook: TestFunction): void {
  registry.afterEach(hook);
}

/** Vitest's global `expect`, with the matchers in `expect.ts`. */
export const expect: ShimExpect = registry.expect;

/** Vitest's `assert(condition, message)`: throws when the condition is false, and narrows its type. */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new AssertionError(message ?? "expected the condition to be true");
  }
}

/** The options of `vi.waitFor`, with Vitest's defaults. */
export interface WaitForOptions {
  readonly timeout?: number;
  readonly interval?: number;
}

/**
 * Vitest's `vi`, with only `waitFor`: calls `check` until it stops throwing.
 * It counts tries instead of reading the clock, because workerd's `Date`
 * only moves between I/O.
 */
export const vi = {
  async waitFor<T>(check: () => T | Promise<T>, options: WaitForOptions = {}): Promise<T> {
    const interval = options.interval ?? 50;
    const tries = Math.max(1, Math.ceil((options.timeout ?? 1000) / interval));
    for (let attempt = 1; ; attempt++) {
      try {
        return await check();
      } catch (error) {
        if (attempt >= tries) {
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  },
};
