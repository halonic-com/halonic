/**
 * Splits tokens into statements (spec 1.4) and merges an edit patch into a
 * program by statement name (spec 7).
 */

import { type Located, lex, type Token } from "./lexer.ts";
import { prepareSource } from "./source.ts";

export interface Statement {
  /** The name on the left, with the `$` for a state declaration. */
  readonly name: string;
  /** The right side, newlines left out. */
  readonly tokens: readonly Token[];
  /** The whole statement as written. */
  readonly text: string;
}

export interface SplitProgram {
  readonly statements: readonly Statement[];
  /** The text ended inside an unclosed string or bracket, so the last statement needs closing. */
  readonly open: boolean;
}

const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);
const KEYWORDS = new Set(["true", "false", "null"]);

export function splitStatements(source: string, tokens: readonly Located[]): SplitProgram {
  const groups: Located[][] = [];
  let current: Located[] = [];
  let depth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === "punct" && OPENERS.has(token.value)) depth++;
    if (token.kind === "punct" && CLOSERS.has(token.value)) depth = Math.max(0, depth - 1);
    if (token.kind !== "newline") {
      current.push(token);
    } else if (depth === 0 && !continuesTernary(current, tokens.slice(index + 1))) {
      groups.push(current);
      current = [];
    }
  }
  groups.push(current);
  const last = tokens.at(-1);
  const openString = last?.kind === "string" && !last.closed;
  const statements = groups.flatMap((group) => toStatement(source, group));
  return { statements, open: depth > 0 || openString };
}

/** A ternary stays open over a newline (spec 1.4, rule 3). */
function continuesTernary(line: readonly Token[], after: readonly Token[]): boolean {
  const last = line.at(-1);
  if (last?.kind === "punct" && (last.value === "?" || last.value === ":")) return true;
  const next = after.find((token) => token.kind !== "newline");
  return next?.kind === "punct" && (next.value === "?" || next.value === ":");
}

function toStatement(source: string, group: readonly Located[]): Statement[] {
  const [head, equals, ...value] = group;
  if (head === undefined || (head.kind !== "name" && head.kind !== "state")) return [];
  if (equals?.kind !== "punct" || equals.value !== "=") return [];
  const end = group.at(-1)?.end ?? head.end;
  return [{ name: head.value, tokens: value, text: source.slice(head.start, end) }];
}

/** The statement names a statement's right side refers to. */
export function referencedNames(tokens: readonly Token[]): string[] {
  return tokens.flatMap((token, index) => {
    if (token.kind !== "name" || KEYWORDS.has(token.value)) return [];
    const next = tokens[index + 1];
    const previous = tokens[index - 1];
    const isCallHead = next?.kind === "punct" && next.value === "(";
    const isField = previous?.kind === "punct" && previous.value === ".";
    return isCallHead || isField ? [] : [token.value];
  });
}

/** The names reachable from `entry`, following references. */
export function reachableNames(
  entry: string,
  statements: ReadonlyMap<string, readonly Token[]>,
): Set<string> {
  const reached = new Set<string>();
  const waiting = [entry];
  for (let name = waiting.pop(); name !== undefined; name = waiting.pop()) {
    const tokens = statements.get(name);
    if (reached.has(name) || tokens === undefined) continue;
    reached.add(name);
    waiting.push(...referencedNames(tokens));
  }
  return reached;
}

/**
 * Merges an edit patch into a program (spec 7): a patch statement replaces
 * the one with its name or is added at the end, `name = null` deletes, and
 * when there is a `root` statement whatever it can't reach is removed.
 */
export function mergeOpenUiEdit(program: string, patch: string): string {
  const merged = new Map<string, Statement>();
  for (const statement of readStatements(program)) merged.set(statement.name, statement);
  for (const statement of readStatements(patch)) {
    const [only] = statement.tokens;
    const deletes = statement.tokens.length === 1 && only?.kind === "name" && only.value === "null";
    if (deletes) merged.delete(statement.name);
    else merged.set(statement.name, statement);
  }
  let kept = [...merged.values()];
  if (merged.has("root")) {
    const tokensByName = new Map(kept.map((statement) => [statement.name, statement.tokens]));
    const reached = reachableNames("root", tokensByName);
    kept = kept.filter(
      (statement) => statement.name.startsWith("$") || reached.has(statement.name),
    );
  }
  return kept.map((statement) => statement.text).join("\n");
}

function readStatements(text: string): readonly Statement[] {
  const source = prepareSource(text);
  return splitStatements(source, lex(source)).statements;
}
