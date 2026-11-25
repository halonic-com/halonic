import { posix } from "node:path";

/** The module of `@opencode/schema` that holds OpenCode's config schema. */
export const configModule = "config.js";

/**
 * Keys of a schema's annotations, not of the config: a field's description
 * or the schema's name. They are left out, so only config keys are listed.
 */
const annotationKeys = new Set(["description", "identifier", "title", "examples", "default"]);

/** A key of an object literal at the start of a line: `  baseURL: …` or `  "max-tokens": …`. */
const keyLine = /^\s+(?:([A-Za-z_$][\w$]*)|"([^"]+)"):\s/;

/** A relative import or re-export: `from "./config/provider.js"`. */
const relativeImport = /from\s+"(\.{1,2}\/[^"]+\.js)"/g;

/**
 * Every key of OpenCode's config schema, as `<module>: <key>`, sorted, each
 * once.
 *
 * `modules` is the built `dist` folder of `@opencode/schema`, by path
 * relative to it. The schema is built from {@link configModule} and the
 * modules it imports, which hold shared parts such as a provider's
 * settings (`baseURL`), so every module reached from it is read. A key is
 * a property name at the start of a line, as the package's built JavaScript
 * writes its schemas, one field per line.
 *
 * @throws Error when `modules` has no {@link configModule}
 */
export function readSchemaKeys(modules: ReadonlyMap<string, string>): string[] {
  if (!modules.has(configModule)) {
    throw new Error(`The schema package has no ${configModule}: its layout changed.`);
  }
  const keys = new Set<string>();
  for (const path of modulesReachedFrom(configModule, modules)) {
    for (const key of objectKeys(modules.get(path) ?? "")) keys.add(`${path}: ${key}`);
  }
  return [...keys].sort();
}

/** `entry` and every module it imports, directly or not, that `modules` holds. */
function modulesReachedFrom(entry: string, modules: ReadonlyMap<string, string>): string[] {
  const reached = new Set<string>();
  const waiting = [entry];
  for (let path = waiting.pop(); path !== undefined; path = waiting.pop()) {
    if (reached.has(path) || !modules.has(path)) continue;
    reached.add(path);
    for (const match of (modules.get(path) ?? "").matchAll(relativeImport)) {
      waiting.push(posix.normalize(posix.join(posix.dirname(path), match[1] ?? "")));
    }
  }
  return [...reached];
}

function objectKeys(source: string): string[] {
  const keys: string[] = [];
  for (const line of source.split("\n")) {
    const match = keyLine.exec(line);
    const key = match?.[1] ?? match?.[2];
    if (key !== undefined && !annotationKeys.has(key)) keys.push(key);
  }
  return keys;
}
