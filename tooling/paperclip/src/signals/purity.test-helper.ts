import ts from "@typescript/typescript6";

/**
 * The purity check of a ToolScript rule (ADR 2026-11-24-toolscript, P1 to
 * P7), on the file's syntax tree rather than its text (Liam, review of
 * #5966): a regex misses `import(…)`, `Date()`, `eval` or `Function(…)` in
 * a form it didn't foresee. The check walks every node and names each place
 * that loads code, reads a clock, randomness, the network or the process,
 * or reaches the global object.
 */

/** Globals a rule may never name: each is I/O, a clock, code loading or a way around the others. */
const forbiddenGlobals = new Set([
  "fetch",
  "eval",
  "Function",
  "globalThis",
  "window",
  "self",
  "global",
  "process",
  "require",
  "module",
  "crypto",
  "performance",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "XMLHttpRequest",
  "WebSocket",
  "Reflect",
  "Proxy",
  "Atomics",
  "SharedArrayBuffer",
]);

/** The only member of `Date` a rule may use: it reads a time from the input, never the clock. */
const allowedDateMembers = new Set(["parse"]);

/** Whether `node` is a name of something other than a variable: a property, a key or a declaration. */
function isNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return true;
  }
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent);
}

/** Why a use of `Date` isn't pure, or undefined when it only parses a time. */
function dateProblem(node: ts.Identifier): string | undefined {
  const parent = node.parent;
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    allowedDateMembers.has(parent.name.text)
  ) {
    return undefined;
  }
  return "uses Date other than Date.parse, which can read the clock";
}

/** Why an import or export is refused: anything but `import type`, or a re-export. */
function importProblem(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    const typeOnly =
      clause !== undefined &&
      (clause.isTypeOnly ||
        (clause.name === undefined &&
          clause.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly)));
    return typeOnly ? undefined : "imports a value";
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
    return node.isTypeOnly ? undefined : "re-exports a value from another module";
  }
  if (ts.isImportEqualsDeclaration(node)) {
    return "imports with import =";
  }
  return undefined;
}

/** Why a use of `Math` isn't pure, or undefined for a named member other than `random`. */
function mathProblem(node: ts.Identifier): string | undefined {
  const parent = node.parent;
  if (!ts.isPropertyAccessExpression(parent) || parent.expression !== node) {
    // An alias or a destructuring (`const M = Math`, `const { random } = Math`)
    // or a computed member hides which member is used, so it can't be checked.
    return "uses Math other than by a named member, which can hide Math.random";
  }
  return parent.name.text === "random" ? "reads randomness with Math.random" : undefined;
}

/** Keys that reach a value's constructor or prototype, and from there `Function`. */
const prototypeKeys = new Set(["constructor", "__proto__"]);

/** Whether `node` reads `.constructor` or `.__proto__`, by name or by a string key. */
function reachesPrototype(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return prototypeKeys.has(node.name.text);
  }
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression;
    return ts.isStringLiteralLike(key) && prototypeKeys.has(key.text);
  }
  return false;
}

/** Why one node's use of code, a clock, randomness or I/O isn't pure, or undefined. Imports are `importProblem`'s. */
function useProblem(node: ts.Node): string | undefined {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return "loads code with import(…)";
  }
  if (ts.isMetaProperty(node)) {
    return "reads import.meta";
  }
  if (reachesPrototype(node)) {
    return "reaches a constructor or prototype, a way to Function";
  }
  if (!ts.isIdentifier(node) || isNameOnly(node)) {
    return undefined;
  }
  if (node.text === "Date") {
    return dateProblem(node);
  }
  if (node.text === "Math") {
    return mathProblem(node);
  }
  return forbiddenGlobals.has(node.text) ? `names ${node.text}` : undefined;
}

/** Every node of `source` for which `problem` gives a reason, as `line:column reason`. */
function findAll(
  fileName: string,
  source: string,
  problem: (node: ts.Node) => string | undefined,
): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const reason = problem(node);
    if (reason !== undefined) {
      const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
      found.push(`${line + 1}:${character + 1} ${reason}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Every import or re-export in `source` that brings in a value rather than
 * only types, as `line:column what`; empty when the rule imports only types.
 */
export function valueImports(fileName: string, source: string): string[] {
  return findAll(fileName, source, importProblem);
}

/**
 * Every place in `source` that loads code, reads a clock, randomness, the
 * network or the process, or reaches the global object, as `line:column what`.
 *
 * @example
 * impureUses("a.ts", "export const now = () => Date.now();"); // ["1:26 uses Date other than …"]
 */
export function impureUses(fileName: string, source: string): string[] {
  return findAll(fileName, source, useProblem);
}

/** Every place in `source` a ToolScript rule may not have, imports first; empty for a pure rule. */
export function impurities(fileName: string, source: string): string[] {
  return [...valueImports(fileName, source), ...impureUses(fileName, source)];
}
