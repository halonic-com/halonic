/**
 * A deep copy through JSON, as a store on disk or in the cloud would make.
 * Callers can't change what is stored, and what goes in comes out as plain
 * JSON data on every adapter.
 */
export function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
