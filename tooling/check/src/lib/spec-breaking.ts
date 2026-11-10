// What counts as a breaking change to a public API's JSON Schema (HAL-1664),
// following the freeze rule of the ADR `2026-11-07-port-list-and-versions`:
// a new optional property is additive and keeps the API version; anything
// that makes a file valid before invalid now bumps it. This is a first cut
// that catches the usual breaks; subtler ones are left to review.

type Schema = Readonly<Record<string, unknown>>;

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemasOf(value: unknown): Schema {
  return isSchema(value) ? value : {};
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The breaking changes from the `released` schema to the `current` one, each
 * as a sentence naming where it happens (`properties.name`, `$` for the
 * root). Empty when the change is additive or there is none.
 *
 * A change is breaking when it removes a property or an `enum` value, makes
 * a key newly required, changes a `const`, narrows a `type`, removes an
 * `anyOf`/`oneOf` alternative that no current one covers, adds an `allOf`
 * part or adds a `type`, an `allOf`, an `anyOf` or a `oneOf` to a schema
 * that had none. Widening is not: a dropped
 * `type` key, a `type` that gains a type, a new `anyOf`/`oneOf` alternative,
 * reordered alternatives. Known gaps: only the keywords above are compared
 * (not, for example, `pattern` or `minimum`), and alternatives are matched
 * one at a time, so several released ones merged into one current one are
 * still reported. The added-`type` check also fires when an existing `enum` or
 * `const` already implies that type. Removing a whole `anyOf` or `oneOf` is
 * reported although it widens what is accepted.
 */
export function breakingChanges(released: Schema, current: Schema, path = "$"): string[] {
  const changes: string[] = [];
  if ("type" in released && !typeStillAllowed(released["type"], current["type"])) {
    changes.push(
      `${path}: "type" changed from ${JSON.stringify(released["type"])} to ${JSON.stringify(current["type"])}.`,
    );
  }
  if ("const" in released && !sameJson(released["const"], current["const"])) {
    changes.push(
      `${path}: "const" changed from ${JSON.stringify(released["const"])} to ${JSON.stringify(current["const"])}.`,
    );
  }
  if (!("type" in released) && "type" in current) {
    changes.push(
      `${path}: a "type" of ${JSON.stringify(current["type"])} was added, which narrows what is accepted.`,
    );
  }
  const values = listOf(current["enum"]);
  for (const value of listOf(released["enum"])) {
    if (!values.some((kept) => sameJson(kept, value))) {
      changes.push(`${path}: the enum value ${JSON.stringify(value)} was removed.`);
    }
  }
  const wasRequired = listOf(released["required"]);
  for (const key of listOf(current["required"])) {
    if (!wasRequired.includes(key)) {
      changes.push(`${path}: "${String(key)}" is newly required.`);
    }
  }
  changes.push(...breakingChangesBelow(released, current, path));
  return changes;
}

/** The type names a `type` keyword allows; `integer` is a kind of `number`. `undefined` (no `type`) allows every type. */
function typeStillAllowed(before: unknown, after: unknown): boolean {
  if (after === undefined) {
    return true;
  }
  const allowed = listOf(Array.isArray(after) ? after : [after]);
  return listOf(Array.isArray(before) ? before : [before]).every(
    (type) => allowed.includes(type) || (type === "integer" && allowed.includes("number")),
  );
}

/** The changes inside the sub-schemas: properties, definitions, items and alternatives. */
function breakingChangesBelow(released: Schema, current: Schema, path: string): string[] {
  const changes = [
    ...breakingChangesInGroup(released, current, path, "properties", "property"),
    ...breakingChangesInGroup(released, current, path, "$defs", "definition"),
  ];
  if (isSchema(released["items"])) {
    changes.push(
      ...breakingChanges(released["items"], schemasOf(current["items"]), `${path}.items`),
    );
  }
  changes.push(...breakingChangesInAllOf(released, current, path));
  for (const group of ["anyOf", "oneOf"]) {
    changes.push(...breakingChangesInAlternatives(released, current, path, group));
  }
  return changes;
}

/** The changes in a named group of sub-schemas (`properties` or `$defs`): removed names and changed ones. */
function breakingChangesInGroup(
  released: Schema,
  current: Schema,
  path: string,
  group: string,
  noun: string,
): string[] {
  const before = schemasOf(released[group]);
  const after = schemasOf(current[group]);
  const changes: string[] = [];
  for (const name of Object.keys(before)) {
    if (name in after) {
      changes.push(
        ...breakingChanges(
          schemasOf(before[name]),
          schemasOf(after[name]),
          `${path}.${group}.${name}`,
        ),
      );
    } else {
      changes.push(`${path}: the ${noun} "${name}" was removed.`);
    }
  }
  return changes;
}

/**
 * The changes in `allOf`, whose sub-schemas all apply and are compared by
 * position. More parts accept fewer files, so a longer list is breaking and a
 * shorter one is not.
 */
function breakingChangesInAllOf(released: Schema, current: Schema, path: string): string[] {
  const before = listOf(released["allOf"]);
  const after = listOf(current["allOf"]);
  const changes: string[] = [];
  if (before.length === 0 && after.length > 0) {
    changes.push(
      `${path}: "allOf" with ${after.length} ${after.length === 1 ? "part" : "parts"} was added, which narrows what is accepted.`,
    );
  } else if (after.length > before.length) {
    changes.push(
      `${path}: the number of "allOf" parts changed from ${before.length} to ${after.length}.`,
    );
  }
  before.slice(0, after.length).forEach((part, index) => {
    changes.push(
      ...breakingChanges(schemasOf(part), schemasOf(after[index]), `${path}.allOf[${index}]`),
    );
  });
  return changes;
}

/**
 * The changes in a list of alternatives (`anyOf` or `oneOf`), compared by
 * content: a released alternative is kept when some current one accepts all it
 * accepted. A lost one is named by its released position, with the changes to
 * its closest current alternative; fewer alternatives than before is reported
 * as a count instead.
 */
function breakingChangesInAlternatives(
  released: Schema,
  current: Schema,
  path: string,
  group: string,
): string[] {
  const before = listOf(released[group]);
  const after = listOf(current[group]);
  if (before.length === 0 && after.length > 0) {
    return [
      `${path}: "${group}" with ${after.length} ${after.length === 1 ? "alternative" : "alternatives"} was added, which narrows what is accepted.`,
    ];
  }
  if (after.length < before.length) {
    return [
      `${path}: the number of "${group}" alternatives changed from ${before.length} to ${after.length}.`,
    ];
  }
  return before.flatMap((alternative, index) => {
    const options = after.map((candidate) =>
      breakingChanges(schemasOf(alternative), schemasOf(candidate), `${path}.${group}[${index}]`),
    );
    if (options.some((changes) => changes.length === 0)) {
      return [];
    }
    return options.reduce((closest, changes) =>
      changes.length < closest.length ? changes : closest,
    );
  });
}
