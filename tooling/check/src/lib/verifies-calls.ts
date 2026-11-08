import ts from "@typescript/typescript6";

/** The package `verifies()` comes from. */
export const specPackageName = "@halonicjs/testing-spec";

/** One `verifies(…)` call in a test file. */
export interface VerifiesCall {
  readonly file: string;
  readonly line: number;
  /** The requirement ID, or `undefined` when it isn't a plain string. */
  readonly id: string | undefined;
}

/**
 * Finds the calls of `verifies` from `@halonicjs/testing-spec` in a test
 * file with the TypeScript parser, so the check knows which tests should
 * have run. Follows `import { verifies as v }` and `import * as spec`.
 * Other functions named `verifies`, such as testing/spec's own tests of it,
 * don't count.
 */
export function findVerifiesCalls(file: string, text: string): VerifiesCall[] {
  if (!text.includes(specPackageName)) {
    return [];
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const { names, namespaces } = importedNames(source);
  const isVerifies = (callee: ts.Expression): boolean => {
    if (ts.isIdentifier(callee)) {
      return names.has(callee.text);
    }
    return (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      namespaces.has(callee.expression.text) &&
      callee.name.text === "verifies"
    );
  };
  const calls: VerifiesCall[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isVerifies(node.expression)) {
      const first = node.arguments[0];
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const id = first !== undefined && ts.isStringLiteralLike(first) ? first.text : undefined;
      calls.push({ file, line, id });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** The local names `verifies` and the package namespace have in this file. */
function importedNames(source: ts.SourceFile): {
  names: Set<string>;
  namespaces: Set<string>;
} {
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== specPackageName
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) {
      continue;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.getText(source) ?? element.name.text;
      if (imported === "verifies") {
        names.add(element.name.text);
      }
    }
  }
  return { names, namespaces };
}
