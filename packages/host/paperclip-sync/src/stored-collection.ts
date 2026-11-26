import { agentMessagingVersion, type MessagingId } from "@halonicjs/ports";

/** The store's own file format. A change bumps it, and a file in another format is loaded again. */
export const storeFormat = 1;

/**
 * What one saved collection holds: its versions, how fresh it is, and the items in the port's
 * types. Never a provider's record: the provider converted each item before the store saw it.
 */
export interface StoredCollection<Item> {
  /** {@link storeFormat} when it was written. */
  store: number;
  /** `agentMessagingVersion` the items were made with. */
  port: number;
  /** The provider's mapping version the items were made with. */
  mapping: string;
  source: MessagingId;
  /** The collection's watermark: the source's time of the newest change applied. */
  asOf: string;
  items: readonly Item[];
}

/** What reading a saved collection gave: its contents, or why it counts as missing. */
export type StoredRead<Item> =
  | { kind: "kept"; stored: StoredCollection<Item> }
  | { kind: "missing"; why: string };

/**
 * `value` as a saved collection of `source`, or why it counts as missing: another store format or
 * port version (items of an older port aren't trusted to fit), another source, or a broken file.
 * An item that isn't a record with an ID, or names another source, is dropped on its own.
 */
export function readStored<Item extends { id: MessagingId }>(
  value: unknown,
  source: MessagingId,
): StoredRead<Item> {
  if (!isRecord(value)) return { kind: "missing", why: "it isn't a stored collection" };
  if (value["store"] !== storeFormat) return { kind: "missing", why: "another store format" };
  if (value["port"] !== agentMessagingVersion) return { kind: "missing", why: "another port" };
  if (value["source"] !== source) return { kind: "missing", why: "another source" };
  const { mapping, asOf, items } = value;
  if (typeof mapping !== "string" || typeof asOf !== "string" || !Array.isArray(items)) {
    return { kind: "missing", why: "its versions or items are broken" };
  }
  const kept = items.filter(
    (item: unknown) =>
      isRecord(item) &&
      typeof item["id"] === "string" &&
      (item["source"] === undefined || item["source"] === source),
  );
  // The items left are the port's fields as this store wrote them, in a file only the user can change.
  const stored = { store: storeFormat, port: agentMessagingVersion, mapping, source, asOf };
  return { kind: "kept", stored: { ...stored, items: kept as Item[] } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
