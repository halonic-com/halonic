import ts from "@typescript/typescript6";
import { messages, type ProblemRule } from "./messages.ts";
import type { Problems } from "./source.ts";

type Finding = readonly [ProblemRule, string];

/**
 * Names a ToolScript may not use as a value (P1, P4, P5). A local binding with
 * one of these names is refused too: simpler and stricter than following scopes.
 */
const bannedNames: ReadonlyMap<string, Finding> = new Map<string, Finding>([
  ["require", ["P1", "require"]],
  ...[
    "eval",
    "Function",
    "AsyncFunction",
    "GeneratorFunction",
    "AsyncGeneratorFunction",
    "globalThis",
    "window",
    "self",
    "Proxy",
    "Reflect",
    "Atomics",
    "SharedArrayBuffer",
    "WebAssembly",
  ].map((name): [string, Finding] => [name, ["P4", name]]),
  ...[
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "setTimeout",
    "setInterval",
    "process",
    "Deno",
    "Bun",
  ].map((name): [string, Finding] => [name, ["P5", name]]),
]);

/** Members that reach a constructor or a prototype's internals, whatever object they're read on (P4). */
const bannedMembers = new Set([
  "constructor",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/** `<object>.<member>` reads that are refused on these globals (P4, P5). */
const bannedReads: ReadonlyMap<string, Finding> = new Map<string, Finding>([
  ["arguments.callee", ["P4", "arguments.callee"]],
  ["arguments.caller", ["P4", "arguments.caller"]],
  ["crypto.subtle", ["P5", "crypto.subtle"]],
  ["Date.now", ["P5", "Date.now()"]],
  ["Math.random", ["P5", "Math.random"]],
]);

const definers = new Set(["defineProperty", "defineProperties", "setPrototypeOf"]);

/** Parents whose `name` is a key, not a value: `obj.self`, `{ fetch: 1 }`, `get window()`. */
function isKeyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  const keyed =
    ts.isPropertyAccessExpression(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent);
  return keyed && parent.name === node;
}

function isLabel(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)
  );
}

/** The member a property or element access reads, when it's written out. */
function memberName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/** The identifier an access chain starts from: `ctx` for `ctx.github.x`. */
function rootName(node: ts.Expression): string | undefined {
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

/** True when an access chain passes through `.prototype`, such as `Array.prototype.map`. */
function throughPrototype(node: ts.Expression): boolean {
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (memberName(current) === "prototype") return true;
    current = current.expression;
  }
  return false;
}

function isAssignment(node: ts.Node): node is ts.BinaryExpression {
  if (!ts.isBinaryExpression(node)) return false;
  const operator = node.operatorToken.kind;
  return operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
}

function checkAccess(node: ts.Expression, problems: Problems): void {
  const member = memberName(node);
  if (member === undefined) return;
  if (bannedMembers.has(member)) {
    problems.add("P4", messages.notAllowed("P4", `.${member}`), node);
    return;
  }
  const object = ts.isPropertyAccessExpression(node) ? node.expression : undefined;
  const read = object !== undefined && ts.isIdentifier(object) ? `${object.text}.${member}` : "";
  const finding = bannedReads.get(read);
  if (finding !== undefined) problems.add(finding[0], messages.notAllowed(...finding), node);
}

function checkCall(node: ts.CallExpression, problems: Problems): void {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    problems.add("P1", messages.notAllowed("P1", "import()"), node);
    return;
  }
  const callee = node.expression;
  const [target] = node.arguments;
  const defines =
    ts.isPropertyAccessExpression(callee) &&
    rootName(callee) === "Object" &&
    definers.has(callee.name.text);
  if (defines && target !== undefined && rootName(target) === "ctx") {
    problems.add("P4", messages.notAllowed("P4", "a getter or setter on ctx"), node);
  }
}

/** Syntax that is refused wherever it appears (P4, P7). */
const bannedKinds: ReadonlyMap<ts.SyntaxKind, Finding> = new Map<ts.SyntaxKind, Finding>([
  [ts.SyntaxKind.WithStatement, ["P4", "with"]],
  [ts.SyntaxKind.DebuggerStatement, ["P4", "debugger"]],
  [ts.SyntaxKind.NonNullExpression, ["P7", "the non-null assertion !"]],
]);

function checkIdentifier(node: ts.Identifier, problems: Problems): void {
  const finding = bannedNames.get(node.text);
  if (finding !== undefined && !isKeyName(node) && !isLabel(node)) {
    problems.add(finding[0], messages.notAllowed(...finding), node);
  }
}

function checkNew(node: ts.NewExpression, problems: Problems): void {
  const noArguments = node.arguments === undefined || node.arguments.length === 0;
  if (ts.isIdentifier(node.expression) && node.expression.text === "Date" && noArguments) {
    problems.add("P5", messages.notAllowed("P5", "new Date() without arguments"), node);
  }
}

function writesPrototype(node: ts.Node): boolean {
  if (isAssignment(node)) return throughPrototype(node.left);
  return ts.isDeleteExpression(node) && throughPrototype(node.expression);
}

function checkNode(node: ts.Node, problems: Problems): void {
  if (ts.isIdentifier(node)) {
    checkIdentifier(node, problems);
  } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    checkAccess(node, problems);
  } else if (ts.isCallExpression(node)) {
    checkCall(node, problems);
  } else if (ts.isNewExpression(node)) {
    checkNew(node, problems);
  } else if (writesPrototype(node)) {
    problems.add("P4", messages.notAllowed("P4", "writing to a prototype"), node);
  } else {
    const finding = bannedKinds.get(node.kind);
    if (finding !== undefined) problems.add(finding[0], messages.notAllowed(...finding), node);
  }
}

/** Type positions hold no values, so only `any` counts there (P7). */
function checkType(node: ts.Node, problems: Problems): void {
  if (node.kind === ts.SyntaxKind.AnyKeyword) {
    problems.add("P7", messages.notAllowed("P7", "any"), node);
  }
  ts.forEachChild(node, (child) => checkType(child, problems));
}

/**
 * Walks every statement except imports (P1 checks those) for P1's `require`
 * and `import()`, P4, P5, and P7's `any` and `!`. Identifiers count in value
 * positions only: not as property names, in types or as labels.
 */
export function checkCode(file: ts.SourceFile, problems: Problems): void {
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isTypeNode(node)) {
      checkType(node, problems);
      return;
    }
    checkNode(node, problems);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
}
