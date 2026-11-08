import { EMAIL_PATTERN } from "./email.ts";
import { describeValue, type IssueCollector, type Path } from "./issue.ts";
import type { JsonSchema, JsonValue } from "./json-schema-context.ts";
import { INVALID, type Parsed, Schema, validValue } from "./schema.ts";
import { isUrl } from "./url.ts";

type StringCheck =
  | { readonly kind: "min"; readonly length: number }
  | { readonly kind: "max"; readonly length: number }
  | { readonly kind: "regex"; readonly pattern: RegExp; readonly message: string | undefined }
  | { readonly kind: "email" }
  | { readonly kind: "url" };

/** Accepts text. Made by `s.string()`; each check method returns a new schema. */
export class StringSchema extends Schema<string> {
  readonly #checks: readonly StringCheck[];

  constructor(checks: readonly StringCheck[] = []) {
    super();
    this.#checks = checks;
  }

  /** At least `length` characters, counted as Unicode code points (an emoji is one). */
  min(length: number): StringSchema {
    return this.#with({ kind: "min", length });
  }

  /** At most `length` characters, counted as Unicode code points (an emoji is one). */
  max(length: number): StringSchema {
    return this.#with({ kind: "max", length });
  }

  /**
   * Must match `pattern`.
   *
   * @param message - the issue's message; a generic one names the pattern otherwise
   */
  regex(pattern: RegExp, message?: string): StringSchema {
    return this.#with({ kind: "regex", pattern, message });
  }

  /** Must be an email address, by the same rule Zod used. */
  email(): StringSchema {
    return this.#with({ kind: "email" });
  }

  /**
   * Must be an absolute URL, such as `https://example.com/mcp` or `mailto:a@b`.
   * Spaces at either end are removed and tabs and line breaks dropped from the
   * parsed value, as a browser does when it reads a URL.
   */
  url(): StringSchema {
    return this.#with({ kind: "url" });
  }

  override check(input: unknown, path: Path, issues: IssueCollector): Parsed<string> {
    if (typeof input !== "string") {
      issues.reportFatal("invalid_type", path, `Expected text, got ${describeValue(input)}`);
      return INVALID;
    }
    let value = input;
    for (const check of this.#checks) {
      value = runCheck(check, value, path, issues);
    }
    return validValue(value);
  }

  override toJsonSchemaNode(): JsonSchema {
    const node: JsonSchema = { type: "string" };
    const patterns: JsonSchema[] = [];
    for (const check of this.#checks) {
      if (check.kind === "min")
        node["minLength"] = Math.max(Number(node["minLength"] ?? 0), check.length);
      if (check.kind === "max")
        node["maxLength"] = Math.min(
          Number(node["maxLength"] ?? Number.POSITIVE_INFINITY),
          check.length,
        );
      if (check.kind === "url") node["format"] = "uri";
      if (check.kind === "email") {
        node["format"] = "email";
        patterns.push({ pattern: EMAIL_PATTERN.source });
      }
      if (check.kind === "regex") patterns.push({ pattern: check.pattern.source });
    }
    addPatterns(node, patterns);
    return node;
  }

  #with(check: StringCheck): StringSchema {
    return new StringSchema([...this.#checks, check]);
  }
}

// One pattern goes on the node itself; more need `allOf`, because a JSON
// Schema node holds only one `pattern`.
function addPatterns(node: JsonSchema, patterns: JsonSchema[]): void {
  const [first, ...rest] = patterns;
  if (first === undefined) return;
  node["pattern"] = first["pattern"] ?? null;
  if (rest.length > 0) node["allOf"] = rest satisfies JsonValue[];
}

// Returns the value to carry on with: the URL check cleans it up.
function runCheck(check: StringCheck, value: string, path: Path, issues: IssueCollector): string {
  switch (check.kind) {
    case "min":
      if (codePointCount(value) < check.length)
        issues.report("too_small", path, `Expected at least ${characters(check.length)}`);
      return value;
    case "max":
      if (codePointCount(value) > check.length)
        issues.report("too_big", path, `Expected at most ${characters(check.length)}`);
      return value;
    case "regex":
      // A global or sticky pattern remembers where it stopped; start from 0 each time.
      check.pattern.lastIndex = 0;
      if (!check.pattern.test(value)) {
        issues.report(
          "invalid_format",
          path,
          check.message ?? `Doesn't match the pattern ${check.pattern}`,
        );
      }
      return value;
    case "email":
      if (!EMAIL_PATTERN.test(value))
        issues.report("invalid_format", path, "Expected an email address");
      return value;
    case "url":
      return checkUrl(value, path, issues);
  }
}

function checkUrl(value: string, path: Path, issues: IssueCollector): string {
  const trimmed = value.trim();
  if (!isUrl(trimmed)) {
    issues.report("invalid_format", path, "Expected a URL, such as https://example.com");
    return value;
  }
  return trimmed.replace(/[\t\n\r]/g, "");
}

// "😀" is one code point but two UTF-16 units, so String.length would say 2.
function codePointCount(text: string): number {
  let count = 0;
  for (const _codePoint of text) count++;
  return count;
}

function characters(count: number): string {
  return count === 1 ? "1 character" : `${count} characters`;
}
