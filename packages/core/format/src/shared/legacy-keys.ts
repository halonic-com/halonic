/**
 * Returns a copy of `map` with the key `oldName` read as `newName`, so files
 * from before a rename keep loading. When the file already has `newName`,
 * the old key stays as it is and the schema reports it as unknown.
 */
export function renameKey(
  map: Readonly<Record<string, unknown>>,
  oldName: string,
  newName: string,
): Record<string, unknown> {
  if (!Object.hasOwn(map, oldName) || Object.hasOwn(map, newName)) {
    return { ...map };
  }
  // fromEntries defines keys as plain properties, so a "__proto__" key in a
  // file stays data instead of changing the copy's prototype.
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key === oldName ? newName : key, value]),
  );
}

/** Whether a value is a plain map (not a list, not null). */
export function isMap(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
