// Golden files record how the old app (commit 784f78d) behaved. JSON has no
// undefined, so the recordings write it as a marker object; this turns the
// marker back into undefined.
export function decodeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeUndefined);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isUndefinedMarker(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, decodeUndefined(child)]),
  );
}

function isUndefinedMarker(value: object): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$undefined";
}
