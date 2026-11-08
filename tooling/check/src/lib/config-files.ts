import { type Layer, layers } from "./layout.ts";

/**
 * Reads `policy.json` and `dependencies.json` strictly. A typo there must
 * fail the check, not quietly turn a limit into `undefined` and a rule
 * into one that always passes.
 */

/** What an entry in `dependencies.json` is for (plan 7.1). */
export const dependencyCategories = ["outside-world", "studio-framework", "dev-tooling"] as const;

/** One of the dependency categories. */
export type DependencyCategory = (typeof dependencyCategories)[number];

/** One approved external dependency. */
export interface ApprovedDependency {
  readonly category: DependencyCategory;
  /** Package names; `*` matches any text. */
  readonly allowedIn: readonly string[];
  /** The layers it may be used in, on top of the names. */
  readonly layers: readonly Layer[];
  readonly reason: string;
}

/** The contents of `tooling/check/dependencies.json`. */
export interface DependencyList {
  readonly dependencies: Readonly<Record<string, ApprovedDependency>>;
}

/** The contents of `tooling/check/policy.json`. */
export interface Policy {
  readonly coreOrder: readonly string[];
  readonly published: readonly string[];
  readonly adapterGateways: readonly string[];
  readonly fileSize: {
    readonly warnLines: number;
    readonly maxLines: number;
    readonly warnFunctionLines: number;
  };
}

/**
 * Checks the shape of `policy.json`.
 *
 * @throws naming the file and the field when a field is missing, unknown or of the wrong type
 */
export function parsePolicy(path: string, value: unknown): Policy {
  const at = new Place(path);
  const policy = at.object(value, "", ["coreOrder", "published", "adapterGateways", "fileSize"]);
  const fileSize = at.object(policy["fileSize"], "fileSize", [
    "warnLines",
    "maxLines",
    "warnFunctionLines",
  ]);
  return {
    coreOrder: at.strings(policy["coreOrder"], "coreOrder"),
    published: at.strings(policy["published"], "published"),
    adapterGateways: at.strings(policy["adapterGateways"], "adapterGateways"),
    fileSize: {
      warnLines: at.count(fileSize["warnLines"], "fileSize.warnLines"),
      maxLines: at.count(fileSize["maxLines"], "fileSize.maxLines"),
      warnFunctionLines: at.count(fileSize["warnFunctionLines"], "fileSize.warnFunctionLines"),
    },
  };
}

/**
 * Checks the shape of `dependencies.json`.
 *
 * @throws naming the file and the entry when a field is missing, unknown or of the wrong type
 */
export function parseDependencyList(path: string, value: unknown): DependencyList {
  const at = new Place(path);
  const list = at.object(value, "", ["dependencies"]);
  const entries = at.object(list["dependencies"], "dependencies", undefined);
  const dependencies: Record<string, ApprovedDependency> = {};
  for (const [name, raw] of Object.entries(entries)) {
    const field = `dependencies["${name}"]`;
    const entry = at.object(raw, field, ["category", "allowedIn", "layers", "reason"]);
    const reason = at.text(entry["reason"], `${field}.reason`);
    dependencies[name] = {
      category: at.oneOf(entry["category"], `${field}.category`, dependencyCategories),
      allowedIn: at.strings(entry["allowedIn"], `${field}.allowedIn`, true),
      layers: at
        .strings(entry["layers"], `${field}.layers`, true)
        .map((layer, index) => at.oneOf(layer, `${field}.layers[${index}]`, layers)),
      reason,
    };
  }
  return { dependencies };
}

/** Reads typed values from one file and names the field when one is wrong. */
class Place {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  /** An object with exactly these keys (plus a `//` comment), or any keys when `keys` is undefined. */
  object(
    value: unknown,
    field: string,
    keys: readonly string[] | undefined,
  ): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return this.fail(field, "must be an object");
    }
    const record = value as Record<string, unknown>;
    for (const key of keys ?? []) {
      if (!Object.hasOwn(record, key)) {
        this.fail(field === "" ? key : `${field}.${key}`, "is missing");
      }
    }
    const unknownKey = Object.keys(record).find(
      (key) => keys !== undefined && key !== "//" && !keys.includes(key),
    );
    if (unknownKey !== undefined) {
      this.fail(
        field === "" ? unknownKey : `${field}.${unknownKey}`,
        `is not a known setting (known: ${keys?.join(", ")})`,
      );
    }
    return record;
  }

  strings(value: unknown, field: string, nonEmpty = false): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      return this.fail(field, "must be a list of strings");
    }
    if (nonEmpty && value.length === 0) {
      return this.fail(field, "must list at least one entry");
    }
    return value as string[];
  }

  text(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      return this.fail(field, "must be a non-empty string");
    }
    return value;
  }

  count(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return this.fail(field, "must be a whole number above 0");
    }
    return value;
  }

  oneOf<T extends string>(value: unknown, field: string, choices: readonly T[]): T {
    if (!(choices as readonly unknown[]).includes(value)) {
      return this.fail(field, `must be one of: ${choices.join(", ")}`);
    }
    return value as T;
  }

  fail(field: string, reason: string): never {
    throw new Error(
      `${this.#path}: ${field === "" ? "the file" : field} ${reason}. See docs/guides/checks.md.`,
    );
  }
}
