/** One `{input.name}` or `{input.name[]}` placeholder found in a header text. */
export interface Placeholder {
  /** The input's name, without any `[]`. */
  name: string;
  /** True for `{input.name[]}`, one value per item of a list input. */
  each: boolean;
}

const placeholderPattern = /\{input\.([^{}]*)\}/g;

/** Finds every `{input.…}` placeholder in a text. */
export function findPlaceholders(text: string): Placeholder[] {
  return [...text.matchAll(placeholderPattern)].map((match) => {
    const written = match[1] ?? "";
    const each = written.endsWith("[]");
    return { name: each ? written.slice(0, -2) : written, each };
  });
}

/** True when the text holds a `{` or `}` that isn't part of an `{input.…}` placeholder. */
export function hasStrayBrace(text: string): boolean {
  return /[{}]/.test(text.replace(placeholderPattern, ""));
}

/** Every text inside a JSON-like value, at any depth, for placeholder checks. */
export function collectTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectTexts);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(collectTexts);
  }
  return [];
}
