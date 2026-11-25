const commit = "0123456789abcdef0123456789abcdef01234567";

/** A snapshot with no tools and this routing, as JSON data; `undefined` leaves the routing out. */
export function snapshotWith(routing: unknown): unknown {
  const snapshot = { format: 1, workspace: { name: "Acme", commit }, tools: [] };
  return routing === undefined ? snapshot : { ...snapshot, routing };
}
