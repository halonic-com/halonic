import { Dropped, ParametersRefused, wrongShape } from "./dropped.ts";
import { isJsonObject, setOwn } from "./json.ts";
import { maxTextLength } from "./limits.ts";
import type { ListedSchema } from "./listed-schema.ts";
import { passesNameRule, quote, showPath } from "./names.ts";
import { keywordReaders } from "./schema-keywords.ts";
import { UntrustedText } from "./untrusted-text.ts";

const defsPrefix = "#/$defs/";
const definitionsPrefix = "#/definitions/";

/** A `$ref` seen during the rebuild, checked against `$defs` once the whole schema is read. */
interface SeenRef {
  name: string;
  listed: string;
  path: string;
}

/**
 * Reads one listed tool's parameters into a {@link ListedSchema}, keyword by
 * keyword. It collects what it drops in {@link dropped} and throws
 * {@link ParametersRefused} when the whole tool must be refused. Use it
 * through `rebuildParameters`, which checks the nesting depth first.
 */
export class ParametersReader {
  /** A refusal reason for each keyword or entry dropped so far. */
  readonly dropped: string[] = [];
  readonly #refs: SeenRef[] = [];
  readonly #definitionsAtRoot: boolean;

  /** @param definitionsAtRoot - whether the root holds the older `definitions` instead of `$defs` */
  constructor(definitionsAtRoot: boolean) {
    this.#definitionsAtRoot = definitionsAtRoot;
  }

  /** Rebuilds one schema object. `path` is its JSON Pointer, `""` for the root. */
  readSchema(node: Record<string, unknown>, path: string): ListedSchema {
    const schema: Record<string, unknown> = {};
    for (const [listedKeyword, value] of Object.entries(node)) {
      // Older generators write `definitions`; the root's is read as `$defs`.
      const keyword = path === "" && listedKeyword === "definitions" ? "$defs" : listedKeyword;
      const read = keywordReaders.get(keyword);
      if (read === undefined) {
        this.#drop(`the keyword ${quote(listedKeyword)}`, path, "it isn't on the allow-list");
        continue;
      }
      const kept = read(value, path, this);
      if (kept instanceof Dropped) {
        this.#drop(`the keyword ${quote(listedKeyword)}`, path, kept.why);
        continue;
      }
      setOwn(schema, keyword, kept);
    }
    // Each keyword reader returns the type `ListedSchema` declares for its keyword.
    return schema as ListedSchema;
  }

  /** Rebuilds a schema that a keyword holds, or drops the keyword when it isn't an object. */
  readSubschema(value: unknown, path: string): ListedSchema | Dropped {
    return isJsonObject(value) ? this.readSchema(value, path) : wrongShape;
  }

  /** Rebuilds a non-empty array of schemas, such as `anyOf`. */
  readSchemaList(value: unknown, path: string): ListedSchema[] | Dropped {
    if (!Array.isArray(value) || value.length === 0 || !value.every(isJsonObject)) {
      return wrongShape;
    }
    return value.map((entry, index) => this.readSchema(entry, `${path}/${index}`));
  }

  /**
   * Rebuilds `properties` or `$defs`. A name that breaks the name rule
   * refuses the tool; an entry that isn't a schema is dropped.
   */
  readNamedSchemas(
    value: unknown,
    path: string,
    what: string,
  ): Record<string, ListedSchema> | Dropped {
    if (!isJsonObject(value)) {
      return wrongShape;
    }
    const kept: Record<string, ListedSchema> = {};
    for (const [name, entry] of Object.entries(value)) {
      if (!passesNameRule(name)) {
        this.refuse(`the ${what} ${quote(name)} at ${showPath(path)} breaks the name rule`);
      }
      if (!isJsonObject(entry)) {
        this.#drop(`the ${what} ${quote(name)}`, path, "its value isn't a schema");
        continue;
      }
      setOwn(kept, name, this.readSchema(entry, `${path}/${name}`));
    }
    return kept;
  }

  /** Reads a `$ref`, rewriting `#/definitions/<name>`. Any other form refuses the tool. */
  readRef(value: unknown, path: string): string {
    if (typeof value !== "string") {
      return this.refuse(`the \`$ref\` at ${showPath(path)} isn't a string`);
    }
    const ref =
      this.#definitionsAtRoot && value.startsWith(definitionsPrefix)
        ? defsPrefix + value.slice(definitionsPrefix.length)
        : value;
    if (!ref.startsWith(defsPrefix)) {
      return this.refuse(
        `the \`$ref\` ${quote(value)} at ${showPath(path)} doesn't point into \`$defs\``,
      );
    }
    this.#refs.push({ name: ref.slice(defsPrefix.length), listed: value, path });
    return ref;
  }

  /** Reads a `description` or `title` as an {@link UntrustedText}. One that is too long refuses the tool. */
  readText(value: unknown, path: string): UntrustedText | Dropped {
    if (typeof value !== "string") {
      return wrongShape;
    }
    if (value.length > maxTextLength) {
      this.refuse(`the text at ${path} is more than ${maxTextLength} characters`);
    }
    return new UntrustedText(value);
  }

  /** Refuses the tool when a `$ref` names no entry that `$defs` kept. Call it once the whole schema is read. */
  checkRefs(rebuilt: ListedSchema): void {
    const defs = rebuilt.$defs ?? {};
    for (const ref of this.#refs) {
      if (!Object.hasOwn(defs, ref.name)) {
        this.refuse(
          `the \`$ref\` ${quote(ref.listed)} at ${showPath(ref.path)} names nothing kept under \`$defs\``,
        );
      }
    }
  }

  /** @throws {@link ParametersRefused} with `reason`, always */
  refuse(reason: string): never {
    throw new ParametersRefused(reason);
  }

  #drop(what: string, path: string, why: string): void {
    this.dropped.push(`dropped ${what} at ${showPath(path)}: ${why}`);
  }
}
