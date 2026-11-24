/**
 * Parses one statement's right side into an expression of the display part:
 * literals, lists, objects, component calls, references and the two actions.
 * Anything else stops the whole reply with a named `not-supported` feature.
 * At the end of the tokens every open list, object or call is closed, which
 * is the second half of the "close what's open" step.
 */

import type { Token } from "./lexer.ts";
import type { OpenUiActionName } from "./library.ts";
import { OPENUI_MAX_NESTING, OpenUiLimitError } from "./limits.ts";

export type Expression =
  | { readonly kind: "value"; readonly value: string | number | boolean | null }
  | { readonly kind: "list"; readonly items: readonly Expression[] }
  | { readonly kind: "object"; readonly entries: readonly (readonly [string, Expression])[] }
  | { readonly kind: "component"; readonly name: string; readonly args: readonly Expression[] }
  | {
      readonly kind: "action";
      readonly action: OpenUiActionName;
      readonly args: readonly Expression[];
    }
  /** `Action([...])`: several actions in order. */
  | { readonly kind: "actions"; readonly list: Expression }
  | { readonly kind: "ref"; readonly name: string };

/** The parts of OpenUI Lang the reader leaves out, by the name a result gives them. */
export type OpenUiFeature = "query" | "mutation" | "state" | "run" | "function" | "expression";

/** Thrown when a statement uses a part of OpenUI Lang the reader leaves out. */
export class NotSupportedError extends Error {
  readonly feature: OpenUiFeature;

  constructor(feature: OpenUiFeature) {
    super(feature);
    this.feature = feature;
  }
}

/** Thrown when a statement isn't complete enough to parse; the statement is dropped. */
export class ParseFailure extends Error {}

const CLOSERS = new Set([")", "]", "}"]);
const LITERALS: Readonly<Record<string, boolean | null>> = { true: true, false: false, null: null };
const ACTIONS = new Set<string>(["ToAssistant", "OpenUrl"]);

const FUNCTION_FEATURES = new Map<string, OpenUiFeature>([
  ["Run", "run"],
  ["Set", "state"],
  ["Reset", "state"],
]);
const CALL_FEATURES = new Map<string, OpenUiFeature>([
  ["Query", "query"],
  ["Mutation", "mutation"],
]);

/** The first feature outside the display part that a statement names, if any. */
export function unsupportedFeature(
  name: string,
  tokens: readonly Token[],
): OpenUiFeature | undefined {
  if (name.startsWith("$")) return "state";
  for (const [index, token] of tokens.entries()) {
    const feature = tokenFeature(token, tokens[index + 1]);
    if (feature) return feature;
  }
  return undefined;
}

function tokenFeature(token: Token, next: Token | undefined): OpenUiFeature | undefined {
  if (token.kind === "state") return "state";
  if (token.kind === "function") return FUNCTION_FEATURES.get(token.value);
  const isCall = next?.kind === "punct" && next.value === "(";
  return token.kind === "name" && isCall ? CALL_FEATURES.get(token.value) : undefined;
}

export function parseExpression(tokens: readonly Token[]): Expression {
  return new Parser(tokens).statementValue();
}

class Parser {
  private position = 0;
  private depth = 0;

  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  statementValue(): Expression {
    // Tokens after a complete value are left alone (the spec leaves them to the client).
    return this.expression();
  }

  private expression(): Expression {
    const value = this.primary();
    const next = this.peek();
    // Any operator, member access, index or call on a value is an expression.
    if (next?.kind === "punct" && next.value !== "," && !CLOSERS.has(next.value)) {
      throw new NotSupportedError("expression");
    }
    return value;
  }

  private primary(): Expression {
    const token = this.take();
    if (token === undefined) throw new ParseFailure("nothing to parse");
    switch (token.kind) {
      case "string":
      case "number":
        return { kind: "value", value: token.value };
      case "name":
        return this.named(token.value);
      case "function":
        return this.functionCall(token.value);
      case "punct":
        return this.bracketed(token.value);
      default:
        throw new NotSupportedError("state");
    }
  }

  private named(name: string): Expression {
    if (name in LITERALS) return { kind: "value", value: LITERALS[name] ?? null };
    if (!this.nextIs("(")) return { kind: "ref", name };
    if (name === "Action") return this.actionList();
    // A lower-case name with arguments isn't a component, so `(` after it is an expression.
    if (!/^[A-Z]/.test(name)) return { kind: "ref", name };
    this.position++;
    return { kind: "component", name, args: this.sequence(")") };
  }

  private functionCall(name: string): Expression {
    // `@ToAss` at the end of a streamed chunk is still being written.
    if (!this.nextIs("(")) throw new ParseFailure("a function name without arguments");
    if (name === "Action") return this.actionList();
    if (!ACTIONS.has(name)) throw new NotSupportedError("function");
    this.position++;
    return { kind: "action", action: name as OpenUiActionName, args: this.sequence(")") };
  }

  private actionList(): Expression {
    this.position++;
    const [list] = this.sequence(")");
    return { kind: "actions", list: list ?? { kind: "list", items: [] } };
  }

  private bracketed(punct: string): Expression {
    if (punct === "[") return { kind: "list", items: this.sequence("]") };
    if (punct === "{") return this.object();
    if (punct === "(" || punct === "-" || punct === "!") throw new NotSupportedError("expression");
    throw new ParseFailure(`unexpected ${punct}`);
  }

  /** Items up to `close`; commas are optional, a closer that doesn't match is skipped. */
  private sequence(close: string): Expression[] {
    this.enter();
    const items: Expression[] = [];
    for (let token = this.peek(); token !== undefined; token = this.peek()) {
      if (token.kind === "punct" && token.value === close) {
        this.position++;
        break;
      }
      if (token.kind === "punct" && (token.value === "," || CLOSERS.has(token.value))) {
        this.position++;
        continue;
      }
      items.push(this.expression());
    }
    this.depth--;
    return items;
  }

  private object(): Expression {
    this.enter();
    const entries: (readonly [string, Expression])[] = [];
    for (let token = this.take(); token !== undefined; token = this.take()) {
      if (token.kind === "punct" && token.value === "}") break;
      if (token.kind === "punct" && (token.value === "," || CLOSERS.has(token.value))) continue;
      const entry = this.entry(token);
      if (entry === undefined) break;
      entries.push(entry);
    }
    this.depth--;
    return { kind: "object", entries };
  }

  /** One `key: value` entry after its key; undefined when the text ends inside it. */
  private entry(key: Token): readonly [string, Expression] | undefined {
    const name =
      key.kind === "string" || key.kind === "number" || key.kind === "name"
        ? String(key.value)
        : "?";
    if (this.peek() === undefined) return undefined;
    if (!this.nextIs(":")) throw new ParseFailure("an object key without a value");
    this.position++;
    if (this.peek() === undefined) return undefined;
    return [name, this.expression()];
  }

  private enter(): void {
    this.depth++;
    if (this.depth > OPENUI_MAX_NESTING) throw new OpenUiLimitError("too-deep");
  }

  private nextIs(punct: string): boolean {
    const next = this.peek();
    return next?.kind === "punct" && next.value === punct;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private take(): Token | undefined {
    const token = this.tokens[this.position];
    if (token !== undefined) this.position++;
    return token;
  }
}
