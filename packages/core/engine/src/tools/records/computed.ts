// A computed field's formula, such as "amount * sharePct / 100": numbers,
// field names, + - * / and parentheses. It is read by hand, never run as
// code, because the formula comes from a workspace file.

import type { RecordValues } from "./record-values.ts";

const tokenPattern = /\d+(\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]/g;

/**
 * The formula's value for a record's values (requirement
 * `engine.record-computed`). A field that is empty or not a number, a
 * division by zero, and a formula that isn't well formed make the whole
 * value `null`.
 *
 * @example
 * evaluateFormula("amount * sharePct / 100", { amount: 200, sharePct: 25 }); // 50
 */
export function evaluateFormula(formula: string, values: RecordValues): number | null {
  const tokens = formula.match(tokenPattern) ?? [];
  if (tokens.join("") !== formula.replace(/\s/g, "")) {
    return null; // a character the formula may not have, such as "%" or "^"
  }
  const reader = new FormulaReader(tokens, values);
  const value = reader.sum();
  return reader.readAll() ? value : null;
}

class FormulaReader {
  readonly #tokens: readonly string[];
  readonly #values: RecordValues;
  #next = 0;
  #wellFormed = true;

  constructor(tokens: readonly string[], values: RecordValues) {
    this.#tokens = tokens;
    this.#values = values;
  }

  sum(): number | null {
    let value = this.product();
    while (this.peek() === "+" || this.peek() === "-") {
      const operator = this.take();
      const right = this.product();
      value = combine(value, right, (left, other) =>
        operator === "+" ? left + other : left - other,
      );
    }
    return value;
  }

  /** Whether the formula was well formed and every token was read. */
  readAll(): boolean {
    return this.#wellFormed && this.#next === this.#tokens.length;
  }

  private product(): number | null {
    let value = this.atom();
    while (this.peek() === "*" || this.peek() === "/") {
      const operator = this.take();
      const right = this.atom();
      value = combine(value, right, (left, other) => {
        if (operator === "*") {
          return left * other;
        }
        return other === 0 ? null : left / other;
      });
    }
    return value;
  }

  private atom(): number | null {
    const token = this.take();
    if (token === "(") {
      const value = this.sum();
      if (this.take() !== ")") {
        this.#wellFormed = false;
      }
      return value;
    }
    if (token === "-") {
      const value = this.atom();
      return value === null ? null : -value;
    }
    if (token !== undefined && /^\d/.test(token)) {
      return Number(token);
    }
    if (token === undefined || !/^[A-Za-z_]/.test(token)) {
      this.#wellFormed = false;
      return null;
    }
    const value = this.#values[token];
    return typeof value === "number" ? value : null;
  }

  private peek(): string | undefined {
    return this.#tokens[this.#next];
  }

  private take(): string | undefined {
    const token = this.#tokens[this.#next];
    this.#next += 1;
    return token;
  }
}

function combine(
  left: number | null,
  right: number | null,
  operation: (left: number, right: number) => number | null,
): number | null {
  return left === null || right === null ? null : operation(left, right);
}
