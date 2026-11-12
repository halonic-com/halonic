import { createExpect, type ShimExpect } from "./expect.ts";
import type { CaseNode, CaseResult, CaseTree, SuiteMeta, SuiteNode } from "./protocol.ts";

/** What a hook and a test body get, the part of Vitest's `TestContext` the suites use. */
export interface ShimTestContext {
  readonly task: { readonly name: string; meta: Record<string, unknown> };
  /** The test's own `expect`, counted apart from the global one, as in Vitest. */
  readonly expect: ShimExpect;
}

/** A test body or hook. */
export type TestFunction = (context: ShimTestContext) => unknown;

/** The options `describe` may take before its body. Only `meta` is used. */
export interface SuiteOptions {
  readonly meta?: SuiteMeta;
}

interface Suite {
  readonly name: string;
  readonly meta: SuiteMeta;
  readonly parent: Suite | null;
  readonly children: (Suite | Case)[];
  readonly beforeEach: TestFunction[];
  readonly afterEach: TestFunction[];
}

interface Case {
  readonly id: string;
  readonly name: string;
  readonly suite: Suite;
  readonly body: TestFunction;
}

/**
 * Collects `describe`/`it` blocks while the Worker's suites load, then runs
 * one case at a time on request. Hooks run as in Vitest: `beforeEach` from
 * the outer block in, `afterEach` from the inner block out, and `afterEach`
 * also after a failed test.
 */
export class TestRegistry {
  readonly #root: Suite = newSuite("", {}, null);
  readonly #cases = new Map<string, Case>();
  #current: Suite = this.#root;

  /** The global `expect`; its counters restart with every case. */
  readonly expect: ShimExpect = createExpect();

  /** Adds a block. The body runs at once, as in Vitest, and must not be async. */
  describe(name: string, body: () => void, options: SuiteOptions = {}): void {
    const suite = newSuite(name, options.meta ?? {}, this.#current);
    this.#current.children.push(suite);
    this.#current = suite;
    try {
      const returned: unknown = body();
      if (returned instanceof Promise) {
        throw new Error(
          `describe("${name}") has an async body. Vitest and the shim collect tests synchronously.`,
        );
      }
    } finally {
      this.#current = suite.parent ?? this.#root;
    }
  }

  /** Adds a case to the current block. */
  it(name: string, body: TestFunction): void {
    const testCase: Case = { id: String(this.#cases.size + 1), name, suite: this.#current, body };
    this.#cases.set(testCase.id, testCase);
    this.#current.children.push(testCase);
  }

  /** Adds a hook that runs before every case in the current block. */
  beforeEach(hook: TestFunction): void {
    this.#current.beforeEach.push(hook);
  }

  /** Adds a hook that runs after every case in the current block. */
  afterEach(hook: TestFunction): void {
    this.#current.afterEach.push(hook);
  }

  /** The collected blocks and cases, without their code. */
  tree(): SuiteNode {
    return toNode(this.#root);
  }

  /**
   * Runs one case with its hooks.
   *
   * @param id - a case ID from {@link tree}
   * @returns how the case ended; a failure is a result, not a thrown error
   * @throws Error when no case has that ID
   */
  async run(id: string): Promise<CaseResult> {
    const testCase = this.#cases.get(id);
    if (testCase === undefined) {
      throw new Error(
        `The test Worker has no case "${id}". List the cases again; the Worker may have restarted.`,
      );
    }
    this.expect.setState({ assertionCalls: 0 });
    const context: ShimTestContext = {
      task: { name: testCase.name, meta: {} },
      expect: createExpect(),
    };
    const suites = ancestorsOf(testCase.suite);
    let failure: unknown = null;
    try {
      for (const suite of suites) {
        for (const hook of suite.beforeEach) await hook(context);
      }
      await testCase.body(context);
    } catch (error) {
      failure = error;
    }
    for (const suite of [...suites].reverse()) {
      for (const hook of [...suite.afterEach].reverse()) {
        try {
          await hook(context);
        } catch (error) {
          failure ??= error;
        }
      }
    }
    const assertions =
      this.expect.getState().assertionCalls + context.expect.getState().assertionCalls;
    return failure === null ? { status: "passed", assertions } : failedResult(failure, assertions);
  }
}

function newSuite(name: string, meta: SuiteMeta, parent: Suite | null): Suite {
  return { name, meta, parent, children: [], beforeEach: [], afterEach: [] };
}

/** The suite and the blocks around it, outermost first. */
function ancestorsOf(suite: Suite): Suite[] {
  const chain: Suite[] = [];
  for (let current: Suite | null = suite; current !== null; current = current.parent) {
    chain.unshift(current);
  }
  return chain;
}

function toNode(suite: Suite): SuiteNode {
  const children: CaseTree[] = suite.children.map((child) =>
    "body" in child
      ? ({ kind: "case", id: child.id, name: child.name } satisfies CaseNode)
      : toNode(child),
  );
  return { kind: "suite", name: suite.name, meta: suite.meta, children };
}

function failedResult(failure: unknown, assertions: number): CaseResult {
  if (failure instanceof Error) {
    return {
      status: "failed",
      assertions,
      message: `${failure.name}: ${failure.message}`,
      stack: failure.stack ?? "",
    };
  }
  return { status: "failed", assertions, message: `A non-Error was thrown: ${String(failure)}` };
}
