import ts from "@typescript/typescript6";

/** A way of switching a test off, or of letting it pass anyway (plan 9.3). */
export interface SkipUse {
  /** How it is written, such as `.skip`, `ctx.skip()` or `retry`. */
  readonly kind: string;
  readonly line: number;
}

/** A `vi.mock(…)` or `vi.doMock(…)` and the module it replaces. */
export interface MockUse {
  readonly specifier: string;
  readonly line: number;
}

/** What the guard needs from one test file or Vitest config. */
export interface TestFileFacts {
  readonly skips: readonly SkipUse[];
  readonly mocks: readonly MockUse[];
}

/** Vitest's functions that take `.skip`, `.only` and the rest. */
const testFunctions = new Set(["test", "it", "describe", "suite", "bench"]);
/** Modifiers that skip a test, focus one or let it fail. */
const modifiers = new Set(["skip", "only", "todo", "skipIf", "runIf", "fails"]);
/** Test options that do the same. `retry` lets a flaky failure pass. */
const options = new Set(["skip", "only", "todo", "fails", "retry"]);

/**
 * Reads a test file (or a Vitest config) with the TypeScript parser and
 * finds every skip and every mock in it:
 * - `.skip`, `.only`, `.todo`, `.skipIf`, `.runIf` and `.fails` on `test`,
 *   `it`, `describe`, `suite` or `bench`, also inside a chain such as
 *   `test.concurrent.skip`
 * - a `skip()` call, as in `ctx.skip()` or a `skip` taken from the context
 * - a `skip`, `only`, `todo`, `fails` or `retry` option passed to a test
 *   function, or in a Vitest config's `test` settings. Other objects, such
 *   as a workflow's own `retry` setting in test data, don't count
 * - `vi.mock(…)` and `vi.doMock(…)`, with a string or an `import(…)`
 */
export function readTestFileFacts(file: string, text: string): TestFileFacts {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const skips: SkipUse[] = [];
  const mocks: MockUse[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isTestModifier(node)) {
      skips.push({ kind: `.${node.name.text}`, line: lineOf(node.name) });
    } else if (ts.isCallExpression(node) && isSkipCall(node)) {
      skips.push({ kind: `${node.expression.getText(source)}()`, line: lineOf(node) });
    } else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name !== undefined && options.has(name) && isTestOptions(node.parent)) {
        skips.push({ kind: `${name} option`, line: lineOf(node) });
      }
    }
    if (ts.isCallExpression(node)) {
      const mocked = mockedModule(node);
      if (mocked !== undefined) {
        mocks.push({ specifier: mocked, line: lineOf(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { skips, mocks };
}

/** `test.skip`, `describe.only`, `test.concurrent.skip`, …: a modifier on a test function. */
function isTestModifier(node: ts.PropertyAccessExpression): boolean {
  return modifiers.has(node.name.text) && startsWithTestFunction(node.expression);
}

/** True for `test`, `test.concurrent`, `describe.each([…])` and other chains on a test function. */
function startsWithTestFunction(expression: ts.Expression): boolean {
  let root = expression;
  while (ts.isPropertyAccessExpression(root) || ts.isCallExpression(root)) {
    root = root.expression;
  }
  return ts.isIdentifier(root) && testFunctions.has(root.text);
}

/**
 * `ctx.skip()`, `context.skip(reason)` or a bare `skip()` from the test
 * context. `test.skip(…)` is counted once, as a modifier.
 */
function isSkipCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === "skip";
  }
  return (
    ts.isPropertyAccessExpression(callee) && callee.name.text === "skip" && !isTestModifier(callee)
  );
}

/** An options object of a test function call, or a Vitest config's `test: { … }`. */
function isTestOptions(node: ts.Node): boolean {
  if (!ts.isObjectLiteralExpression(node)) {
    return false;
  }
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent)) {
    return propertyName(parent.name) === "test";
  }
  return (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node) &&
    startsWithTestFunction(parent.expression)
  );
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** The module `vi.mock(…)` or `vi.doMock(…)` replaces, if this is one. */
function mockedModule(node: ts.CallExpression): string | undefined {
  const callee = node.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !ts.isIdentifier(callee.expression) ||
    callee.expression.text !== "vi" ||
    !["mock", "doMock"].includes(callee.name.text)
  ) {
    return undefined;
  }
  const first = node.arguments[0];
  if (first !== undefined && ts.isStringLiteralLike(first)) {
    return first.text;
  }
  if (
    first !== undefined &&
    ts.isCallExpression(first) &&
    first.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    const specifier = first.arguments[0];
    return specifier !== undefined && ts.isStringLiteralLike(specifier)
      ? specifier.text
      : undefined;
  }
  return undefined;
}
