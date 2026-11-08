import { setOwnProperty } from "./own-property.ts";

/** Any value JSON can hold. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** One JSON Schema node, such as `{ "type": "string", "minLength": 1 }`. */
export type JsonSchema = { [key: string]: JsonValue };

/**
 * State shared while one schema tree is turned into JSON Schema: the
 * definitions that recursive schemas point to with `$ref`.
 */
export class JsonSchemaContext {
  readonly #names = new Map<object, string>();
  readonly #definitions: Record<string, JsonSchema> = {};

  /**
   * Returns a `$ref` to the definition of `owner`, building it the first time.
   * The name is taken before `build` runs, so a schema that contains itself
   * gets a `$ref` instead of looping forever.
   */
  reference(owner: object, build: () => JsonSchema): JsonSchema {
    let name = this.#names.get(owner);
    if (name === undefined) {
      // The same names Zod gave, so the published JSON Schemas stay the same.
      name = `__schema${this.#names.size}`;
      this.#names.set(owner, name);
      this.#definitions[name] = build();
    }
    return { $ref: `#/$defs/${name}` };
  }

  /** The definitions built so far, by name. */
  get definitions(): Readonly<Record<string, JsonSchema>> {
    return this.#definitions;
  }

  /**
   * Turns a default value into JSON. Keys whose value is `undefined` are left
   * out, and numbers JSON can't hold (NaN, Infinity) become null, as
   * `JSON.stringify` does.
   */
  toJsonValue(value: unknown): JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) {
      const items: JsonValue[] = [];
      for (const item of value) items.push(this.toJsonValue(item));
      return items;
    }
    if (typeof value === "object") {
      const entries: { [key: string]: JsonValue } = {};
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined) setOwnProperty(entries, key, this.toJsonValue(item));
      }
      return entries;
    }
    return null;
  }
}
