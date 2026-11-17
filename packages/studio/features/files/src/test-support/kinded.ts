/**
 * An error with a kind, as the app's files host throws one: its message is safe to show. A plain
 * `Error` stands for a system failure, whose message the Files view never shows (microcopy F13).
 */
export function kinded(kind: "conflict" | "not_found" | "unavailable", message: string): Error {
  return Object.assign(new Error(message), { kind });
}
