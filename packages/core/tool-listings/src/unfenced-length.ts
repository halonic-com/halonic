import type { ListedSchema } from "./listed-schema.ts";

/**
 * Adds up the length of every string in rebuilt parameters that reaches the
 * model unfenced, each time it appears: property names, `required` strings,
 * `$defs` names and the strings in `enum` and `const`. The tool's name is
 * added by the caller.
 */
export function unfencedLength(schema: ListedSchema): number {
  let total = 0;
  for (const named of [schema.properties, schema.$defs]) {
    for (const [name, child] of Object.entries(named ?? {})) {
      total += name.length + unfencedLength(child);
    }
  }
  for (const name of schema.required ?? []) {
    total += name.length;
  }
  for (const value of [...(schema.enum ?? []), schema.const]) {
    if (typeof value === "string") {
      total += value.length;
    }
  }
  for (const child of subschemas(schema)) {
    total += unfencedLength(child);
  }
  return total;
}

function subschemas(schema: ListedSchema): ListedSchema[] {
  const children = [
    ...(schema.prefixItems ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
    ...(schema.allOf ?? []),
  ];
  if (schema.items !== undefined) {
    children.push(schema.items);
  }
  if (typeof schema.additionalProperties === "object") {
    children.push(schema.additionalProperties);
  }
  return children;
}
