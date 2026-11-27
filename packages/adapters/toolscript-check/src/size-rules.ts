import ts from "@typescript/typescript6";
import { maxComplexity, maxFileLines, maxFunctionLines, messages } from "./messages.ts";
import type { Problems } from "./source.ts";

/** Operators that add a path: `&&`, `||`, `??` and their assignments. */
const branchingOperators = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Statements and clauses that add a path. */
const branchingKinds = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);

function addsPath(node: ts.Node): boolean {
  if (branchingKinds.has(node.kind)) return true;
  return ts.isBinaryExpression(node) && branchingOperators.has(node.operatorToken.kind);
}

/**
 * The complexity of one function: 1, plus 1 for each `if`, `?:`, loop
 * (`for`, `for…in`, `for…of`, `while`, `do`), `case`, `catch`, and each `&&`,
 * `||` or `??`. Nested functions count on their own. This is simpler than
 * Biome's cognitive complexity (no extra weight for nesting) and aims at the
 * same limit, 15.
 */
export function complexityOf(body: ts.Node): number {
  let complexity = 1;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (addsPath(node)) complexity += 1;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return complexity;
}

function functionName(node: ts.SignatureDeclaration): string {
  if (node.name !== undefined && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return "(anonymous)";
}

function lineOf(file: ts.SourceFile, position: number): number {
  return file.getLineAndCharacterOfPosition(position).line + 1;
}

/** Counts lines the way an editor shows them; a final newline doesn't start a new line. */
function lineCount(text: string): number {
  if (text === "") return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

/** Checks the size of the file and of every function in it (P6). */
export function checkSize(file: ts.SourceFile, problems: Problems): void {
  const lines = lineCount(file.text);
  if (lines > maxFileLines) problems.add("P6", messages.fileTooLong(lines), 0);
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) && "body" in node && node.body !== undefined) {
      const name = functionName(node);
      const start = node.getStart(file);
      const length = lineOf(file, node.end) - lineOf(file, start) + 1;
      if (length > maxFunctionLines) {
        problems.add("P6", messages.functionTooLong(name, length), node);
      }
      const complexity = complexityOf(node.body);
      if (complexity > maxComplexity) {
        problems.add("P6", messages.tooComplex(name, complexity), node);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
}

const suppressions = /@ts-(?:ignore|expect-error|nocheck)\b/;

/** Refuses comments that switch type errors off (P7). */
export function checkSuppressions(file: ts.SourceFile, problems: Problems): void {
  const seen = new Set<number>();
  const look = (ranges: ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const match = suppressions.exec(file.text.slice(range.pos, range.end));
      if (match !== null) problems.add("P7", messages.notAllowed("P7", match[0]), range.pos);
    }
  };
  const visit = (node: ts.Node): void => {
    look(ts.getLeadingCommentRanges(file.text, node.pos));
    look(ts.getTrailingCommentRanges(file.text, node.end));
    ts.forEachChild(node, visit);
  };
  visit(file);
  look(ts.getLeadingCommentRanges(file.text, file.endOfFileToken.pos));
}
