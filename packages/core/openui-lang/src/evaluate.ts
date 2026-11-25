/**
 * Turns parsed statements into the checked tree: finds the entry (spec 2.2),
 * resolves references (2.3) and checks every component against the library,
 * dropping the smallest broken part and reporting it (8.1, 8.4).
 */

import {
  OpenUiAction,
  OpenUiComponent,
  type OpenUiLibrary,
  type OpenUiProp,
  type OpenUiPropType,
  type OpenUiValue,
} from "./library.ts";
import {
  OPENUI_MAX_NESTING,
  OPENUI_MAX_NODES,
  OPENUI_MAX_ROWS,
  OpenUiLimitError,
} from "./limits.ts";
import type { Expression } from "./parse.ts";

/** Why part of a reply was dropped, or why nothing rendered. */
export type OpenUiErrorCode =
  | "unknown-component"
  | "missing-required"
  | "null-required"
  | "type-mismatch"
  | "excess-args"
  | "no-root"
  | "parse-failed";

/** One reported problem, in the spec's error shape (8.3) without the text for the model. */
export interface OpenUiReadError {
  readonly source: "parser";
  readonly code: OpenUiErrorCode;
  readonly statementId?: string;
  readonly component?: string;
  readonly path?: string;
  /** Set when the reply still renders, today only for a `no-root` with a fallback entry. */
  readonly severity?: "warning";
}

/** The checked tree and what the reader noticed on the way. */
export interface OpenUiTree {
  readonly kind: "tree";
  /** The component to draw, or null when nothing renders. */
  readonly root: OpenUiComponent | null;
  readonly errors: readonly OpenUiReadError[];
  /** References to statements that don't exist (yet), sorted. */
  readonly unresolved: readonly string[];
  /** Statements the entry can't reach, which aren't drawn, sorted. */
  readonly orphans: readonly string[];
  /** The text ended inside an unclosed string or bracket. */
  readonly incomplete: boolean;
}

/** A parsed statement. */
export interface ParsedStatement {
  readonly name: string;
  readonly expression: Expression;
}

interface Program {
  readonly statements: readonly ParsedStatement[];
  readonly library: OpenUiLibrary;
  /** The stream has ended: checks that wait for the end run, and a missing entry is an error. */
  readonly final: boolean;
  readonly incomplete: boolean;
  readonly hasText: boolean;
}

export function evaluateProgram(program: Program): OpenUiTree {
  const { statements, library, final } = program;
  if (final && program.hasText && statements.length === 0) {
    return tree(null, [{ source: "parser", code: "parse-failed" }], [], [], program.incomplete);
  }
  const byName = new Map(statements.map((statement) => [statement.name, statement.expression]));
  const fallback = statements.find(
    (statement) =>
      byName.get(statement.name) === statement.expression &&
      isCallTo(statement.expression, library.root),
  );
  const entry = byName.has("root") ? "root" : fallback?.name;
  const evaluator = new Evaluator(byName, library, final);
  const value = entry === undefined ? undefined : evaluator.resolve(entry);
  const root = value instanceof OpenUiComponent ? value : null;
  const errors = [...evaluator.errors.values()];
  if (final && (root === null || entry !== "root")) {
    errors.push({
      source: "parser",
      code: "no-root",
      ...(root === null ? {} : { severity: "warning" as const }),
    });
  }
  const reached = entry === undefined ? new Set(byName.keys()) : reachable(entry, byName);
  const orphans = [...byName.keys()].filter((name) => !reached.has(name));
  return tree(root, errors, [...evaluator.unresolved], orphans, program.incomplete);
}

function tree(
  root: OpenUiComponent | null,
  errors: readonly OpenUiReadError[],
  unresolved: readonly string[],
  orphans: readonly string[],
  incomplete: boolean,
): OpenUiTree {
  return {
    kind: "tree",
    root,
    errors,
    unresolved: [...unresolved].sort(),
    orphans: [...orphans].sort(),
    incomplete,
  };
}

function isCallTo(expression: Expression, component: string | undefined): boolean {
  return (
    component !== undefined && expression.kind === "component" && expression.name === component
  );
}

function reachable(entry: string, byName: ReadonlyMap<string, Expression>): Set<string> {
  const reached = new Set<string>();
  const visit = (expression: Expression): void => {
    if (expression.kind === "ref") {
      const target = byName.get(expression.name);
      if (target === undefined || reached.has(expression.name)) return;
      reached.add(expression.name);
      visit(target);
    } else {
      for (const child of childrenOf(expression)) visit(child);
    }
  };
  visit({ kind: "ref", name: entry });
  return reached;
}

function childrenOf(expression: Expression): readonly Expression[] {
  switch (expression.kind) {
    case "list":
      return expression.items;
    case "object":
      return expression.entries.map(([, value]) => value);
    case "component":
    case "action":
      return expression.args;
    case "actions":
      return [expression.list];
    default:
      return [];
  }
}

/** `undefined` means nothing: an unresolved reference or a dropped component. */
type Result = OpenUiValue | undefined;

class Evaluator {
  readonly errors = new Map<string, OpenUiReadError>();
  readonly unresolved = new Set<string>();
  private readonly stack: string[] = [];
  private nodes = 0;
  private depth = 0;

  private readonly byName: ReadonlyMap<string, Expression>;
  private readonly library: OpenUiLibrary;
  private readonly final: boolean;

  constructor(byName: ReadonlyMap<string, Expression>, library: OpenUiLibrary, final: boolean) {
    this.byName = byName;
    this.library = library;
    this.final = final;
  }

  resolve(name: string): Result {
    const expression = this.byName.get(name);
    // A reference that closes a cycle is unresolved at that point (spec 2.3).
    if (expression === undefined || this.stack.includes(name)) {
      this.unresolved.add(name);
      return undefined;
    }
    this.stack.push(name);
    try {
      return this.evaluate(expression);
    } finally {
      this.stack.pop();
    }
  }

  private evaluate(expression: Expression): Result {
    this.nodes++;
    if (this.nodes > OPENUI_MAX_NODES) throw new OpenUiLimitError("too-large");
    // Nesting counts brackets, as the parser does: a list, an object or a call is one level.
    const nests = expression.kind !== "ref" && expression.kind !== "value";
    if (nests) this.depth++;
    if (this.depth > OPENUI_MAX_NESTING) throw new OpenUiLimitError("too-deep");
    try {
      return this.evaluateNested(expression);
    } finally {
      if (nests) this.depth--;
    }
  }

  private evaluateNested(expression: Expression): Result {
    switch (expression.kind) {
      case "value":
        return expression.value;
      case "ref":
        return this.resolve(expression.name);
      case "list":
        if (expression.items.length > OPENUI_MAX_ROWS) throw new OpenUiLimitError("too-large");
        // A dropped item is left out; an explicit null stays (spec 8.4).
        return expression.items.flatMap((item) => {
          const value = this.evaluate(item);
          return value === undefined ? [] : [value];
        });
      case "object":
        return Object.fromEntries(
          expression.entries.map(([key, value]) => [key, this.evaluate(value) ?? null]),
        );
      case "component":
        return this.component(expression.name, expression.args);
      case "action": {
        const args = expression.args.map((arg) => this.evaluate(arg) ?? null);
        return new OpenUiAction([{ action: expression.action, args }]);
      }
      case "actions": {
        const list = this.evaluate(expression.list);
        const items = Array.isArray(list) ? list : [];
        return new OpenUiAction(
          items.flatMap((item) => (item instanceof OpenUiAction ? item.actions : [])),
        );
      }
    }
  }

  private component(type: string, argExpressions: readonly Expression[]): Result {
    const props = this.library.components[type];
    if (props === undefined) return this.report("unknown-component", type);
    const args = argExpressions.map((arg) => this.evaluate(arg));
    if (args.length > props.length) this.report("excess-args", type);
    const values: Record<string, OpenUiValue> = {};
    for (const [index, prop] of props.entries()) {
      if (index >= args.length) {
        if (prop.required) return this.report("missing-required", type, `/${prop.name}`);
        continue;
      }
      const checked = this.prop(type, prop, args[index]);
      if (checked.drop) return undefined;
      if (checked.value !== undefined) values[prop.name] = checked.value;
    }
    return new OpenUiComponent(type, values);
  }

  /** Checks one argument; `drop` drops the whole component, an absent `value` leaves the prop out. */
  private prop(
    type: string,
    prop: OpenUiProp,
    arg: Result,
  ): { drop: boolean; value?: OpenUiValue } {
    const required = prop.required === true;
    if (arg === null || arg === undefined) {
      // While streaming an unresolved reference may still arrive, so it isn't reported yet.
      if (required && (arg === null || this.final))
        this.report("null-required", type, `/${prop.name}`);
      return { drop: required };
    }
    const value = this.check(type, prop, arg);
    if (value !== undefined) return { drop: false, value };
    this.report("type-mismatch", type, `/${prop.name}`);
    return { drop: required };
  }

  /** The argument as the prop takes it, or undefined when it doesn't fit. */
  private check(type: string, prop: OpenUiProp, arg: OpenUiValue): OpenUiValue | undefined {
    const expected: OpenUiPropType = prop.type;
    if (expected.kind === "list" || expected.kind === "components") {
      if (!Array.isArray(arg)) return undefined;
      if (arg.length > (expected.maxItems ?? OPENUI_MAX_ROWS))
        throw new OpenUiLimitError("too-large");
      if (expected.kind === "components")
        return this.componentsOnly(type, prop.name, arg, expected.only);
      return expected.plainOnly ? this.plainOnly(type, prop.name, arg) : arg;
    }
    return this.fits(expected, arg) ? arg : undefined;
  }

  private fits(expected: OpenUiPropType, arg: OpenUiValue): boolean {
    switch (expected.kind) {
      case "string":
        // Choice checks wait for the end of the stream (spec 8.2).
        return typeof arg === "string" && (!this.final || (expected.oneOf?.includes(arg) ?? true));
      case "link":
        return typeof arg === "string" && isWebLink(arg);
      case "number":
      case "boolean":
        return typeof arg === expected.kind;
      case "object":
        return isPlainObject(arg);
      case "action":
        return arg instanceof OpenUiAction;
      default:
        return true;
    }
  }

  /**
   * In a slot for components, data and components the slot doesn't name are left out and
   * reported; an explicit null stays.
   */
  private componentsOnly(
    type: string,
    name: string,
    items: readonly OpenUiValue[],
    only: readonly string[] | undefined,
  ): OpenUiValue[] {
    return items.filter((item, index) => {
      if (item === null) return true;
      if (item instanceof OpenUiComponent && (only?.includes(item.type) ?? true)) return true;
      this.report("type-mismatch", type, `/${name}/${index}`);
      return false;
    });
  }

  /** In a list of plain values, anything but a string, number, boolean or null is left out and reported. */
  private plainOnly(type: string, name: string, items: readonly OpenUiValue[]): OpenUiValue[] {
    return items.filter((item, index) => {
      if (item === null || typeof item !== "object") return true;
      this.report("type-mismatch", type, `/${name}/${index}`);
      return false;
    });
  }

  private report(code: OpenUiErrorCode, component: string, path?: string): undefined {
    // Every check runs inside a statement, so the stack is never empty here.
    const statementId = this.stack.at(-1) ?? "";
    const error: OpenUiReadError = {
      source: "parser",
      code,
      statementId,
      component,
      ...(path ? { path } : {}),
    };
    this.errors.set(JSON.stringify(error), error);
    return undefined;
  }
}

function isPlainObject(value: OpenUiValue): boolean {
  if (value instanceof OpenUiComponent || value instanceof OpenUiAction) return false;
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Only `http:` and `https:` addresses with a host open (HAL-16863). Core has no `URL`, so the
 * check is on the text: the scheme, `//`, then a host, and no space or control character.
 */
function isWebLink(value: string): boolean {
  if (!/^https?:\/\/[^\s/?#\\]+(?:[/?#]\S*)?$/i.test(value)) return false;
  return [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  });
}
