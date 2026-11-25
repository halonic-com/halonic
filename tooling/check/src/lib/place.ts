/** Reads typed values from one file and names the field when one is wrong. */
export class Place {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  /** An object with exactly these keys (plus a `//` comment), or any keys when `keys` is undefined. */
  object(
    value: unknown,
    field: string,
    keys: readonly string[] | undefined,
    optional: readonly string[] = [],
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
      (key) => keys !== undefined && key !== "//" && !keys.includes(key) && !optional.includes(key),
    );
    if (unknownKey !== undefined) {
      this.fail(
        field === "" ? unknownKey : `${field}.${unknownKey}`,
        `is not a known setting (known: ${[...(keys ?? []), ...optional].join(", ")})`,
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

  flag(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
      return this.fail(field, "must be true or false");
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
