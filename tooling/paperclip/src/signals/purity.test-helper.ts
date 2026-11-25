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

/** Why one node isn't pure, or undefined. */
function nodeProblem(node: ts.Node): string | undefined {
  const imported = importProblem(node);
  if (imported !== undefined) {
    return imported;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return "loads code with import(…)";
  }
  if (ts.isMetaProperty(node)) {
    return "reads import.meta";
  }
  if (!ts.isIdentifier(node) || isNameOnly(node)) {
    return undefined;
  }
  if (node.text === "Date") {
    return dateProblem(node);
  }
  if (node.text === "Math" && ts.isPropertyAccessExpression(node.parent)) {
    return node.parent.name.text === "random" ? "reads randomness with Math.random" : undefined;
  }
  return forbiddenGlobals.has(node.text) ? `names ${node.text}` : undefined;
}

/**
 * Every place in `source` a ToolScript rule may not have, as
 * `line:column what`; empty for a pure rule.
 *
 * @example
 * impurities("a.ts", "export const now = () => Date.now();"); // ["1:26 uses Date other than …"]
 */
export function impurities(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const problem = nodeProblem(node);
    if (problem !== undefined) {
      const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
      found.push(`${line + 1}:${character + 1} ${problem}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
