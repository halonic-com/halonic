import ts from "@typescript/typescript6";
import { readLiteral, withoutAsConst } from "./header-literal.ts";
import { messages } from "./messages.ts";
import type { Problems } from "./source.ts";

/** The only module a ToolScript may import from, and only types (P1). */
const typesModule = "@halonicjs/toolscript";

/** What the top level of a ToolScript holds, once P1–P3 have looked at it. */
export interface Shape {
  /** The header read from the tree, or undefined when P2 refused it. */
  readonly header: unknown;
  /** Where the header is, for the `header:` problems. */
  readonly headerAt: ts.Node | number;
  readonly hasRun: boolean;
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function checkImport(node: ts.ImportDeclaration, problems: Problems): void {
  const typeOnly = node.importClause?.isTypeOnly === true;
  const fromTypes =
    ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === typesModule;
  if (!typeOnly || !fromTypes) problems.add("P1", messages.onlyTypeImport(), node);
}

function checkRun(node: ts.FunctionDeclaration, problems: Problems): void {
  const [parameter, ...more] = node.parameters;
  const isCtx =
    parameter !== undefined &&
    more.length === 0 &&
    parameter.dotDotDotToken === undefined &&
    ts.isIdentifier(parameter.name) &&
    parameter.name.text === "ctx";
  if (!isCtx) problems.add("P3", messages.runShape(), node.name ?? node);
}

/** The exported names a statement declares, with the node to point at. */
function exportedNames(statement: ts.Statement): [string, ts.Node][] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((declaration) => [
      declaration.name.getText(),
      declaration,
    ]);
  }
  const named =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement);
  return named ? [[statement.name?.text ?? "default", statement]] : [];
}

function readHeader(statement: ts.VariableStatement, problems: Problems): unknown {
  const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  const [declaration] = statement.declarationList.declarations;
  if (!isConst || declaration?.initializer === undefined) {
    problems.add("P2", messages.noHeader(), statement);
    return undefined;
  }
  const before = problems.count;
  const value = readLiteral(withoutAsConst(declaration.initializer), problems);
  return problems.count === before ? value : undefined;
}

interface Found {
  header?: unknown;
  headerAt?: ts.Node;
  hasRun: boolean;
}

function checkExport(statement: ts.Statement, found: Found, problems: Problems): void {
  for (const [name, node] of exportedNames(statement)) {
    if (name === "header" && ts.isVariableStatement(statement)) {
      found.headerAt = node;
      found.header = readHeader(statement, problems);
    } else if (name === "run") {
      found.hasRun = true;
      if (ts.isFunctionDeclaration(statement)) checkRun(statement, problems);
      else problems.add("P3", messages.runShape(), node);
    } else {
      problems.add("P3", messages.onlyHeaderAndRun(name), node);
    }
  }
}

function checkStatement(statement: ts.Statement, found: Found, problems: Problems): void {
  if (ts.isImportDeclaration(statement)) {
    checkImport(statement, problems);
  } else if (ts.isImportEqualsDeclaration(statement)) {
    problems.add("P1", messages.onlyTypeImport(), statement);
  } else if (ts.isExportDeclaration(statement)) {
    const rule = statement.moduleSpecifier === undefined ? "P3" : "P1";
    const what = rule === "P1" ? "export … from" : "export { … }";
    problems.add(rule, messages.notAllowed(rule, what), statement);
  } else if (ts.isExportAssignment(statement)) {
    problems.add("P3", messages.onlyHeaderAndRun("default"), statement);
  } else if (isExported(statement)) {
    checkExport(statement, found, problems);
  }
}

/**
 * Checks the top level: imports (P1), the header literal (P2), and that only
 * `header` and `run` are exported, with `run(ctx)` (P3).
 */
export function checkShape(file: ts.SourceFile, problems: Problems): Shape {
  const found: Found = { hasRun: false };
  for (const statement of file.statements) checkStatement(statement, found, problems);
  if (found.headerAt === undefined) problems.add("P2", messages.noHeader(), 0);
  return { header: found.header, headerAt: found.headerAt ?? 0, hasRun: found.hasRun };
}
