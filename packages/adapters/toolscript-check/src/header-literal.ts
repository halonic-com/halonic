import ts from "@typescript/typescript6";
import { messages } from "./messages.ts";
import type { Problems } from "./source.ts";

function propertyKey(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function readObject(node: ts.ObjectLiteralExpression, problems: Problems): unknown {
  const entries: [string, unknown][] = [];
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      problems.add("P2", messages.notLiteral("a spread"), property);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      problems.add("P2", messages.notLiteral("a variable"), property);
    } else if (!ts.isPropertyAssignment(property)) {
      problems.add("P2", messages.notLiteral("a method"), property);
    } else {
      const key = propertyKey(property.name);
      if (key === undefined) {
        problems.add("P2", messages.notLiteral("a computed key"), property.name);
      } else {
        entries.push([key, readLiteral(property.initializer, problems)]);
      }
    }
  }
  // fromEntries defines own properties, so a "__proto__" key stays plain data.
  return Object.fromEntries(entries);
}

function readArray(node: ts.ArrayLiteralExpression, problems: Problems): unknown[] {
  return node.elements.map((element) => {
    if (ts.isSpreadElement(element)) {
      problems.add("P2", messages.notLiteral("a spread"), element);
      return null;
    }
    return readLiteral(element, problems);
  });
}

/** What to call a node that isn't literal data, in a P2 message. */
function describe(node: ts.Expression): string {
  if (ts.isIdentifier(node)) return "a variable";
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return "a call";
  if (ts.isTemplateExpression(node)) return "an interpolated template";
  return "an expression";
}

/**
 * Reads the header's literal into plain data from the syntax tree, without
 * running anything (P2). Adds a P2 problem for each part that isn't literal
 * data; the value read is then incomplete and isn't used.
 */
export function readLiteral(node: ts.Expression, problems: Problems): unknown {
  if (ts.isObjectLiteralExpression(node)) return readObject(node, problems);
  if (ts.isArrayLiteralExpression(node)) return readArray(node, problems);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  const negative =
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand);
  if (negative) return -Number(node.operand.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  problems.add("P2", messages.notLiteral(describe(node)), node);
  return null;
}

/** The literal inside `<literal> as const`, or the expression itself. */
export function withoutAsConst(node: ts.Expression): ts.Expression {
  const asConst =
    ts.isAsExpression(node) &&
    ts.isTypeReferenceNode(node.type) &&
    ts.isIdentifier(node.type.typeName) &&
    node.type.typeName.text === "const";
  return asConst ? node.expression : node;
}
