/** An `OPENCODE_*` name as it stands in the program's text. */
const envName = /OPENCODE_[A-Z0-9_]+/g;

/** The prefix every name starts with; where it shows up again, a new name starts. */
const prefix = "OPENCODE_";

/**
 * Every `OPENCODE_*` name in OpenCode's program, sorted, each once.
 *
 * The program is one binary whose strings sit next to each other, so two
 * names can run together (`OPENCODE_PTY_SOCKET_DIROPENCODE_PTY_SOCKET_DIR`).
 * Each place the prefix shows up again starts a new name. A name the binary
 * glued to a stray capital letter stays as found: it is the same in both
 * versions, so it doesn't show up in a diff.
 *
 * @example
 * readEnvNames(new TextEncoder().encode("x OPENCODE_DB y OPENCODE_DB")); // ["OPENCODE_DB"]
 */
export function readEnvNames(program: Uint8Array): string[] {
  // latin1 keeps one character per byte, so no byte sequence can hide a name.
  const text = new TextDecoder("latin1").decode(program);
  const names = new Set<string>();
  for (const match of text.matchAll(envName)) {
    for (const name of splitAtPrefix(match[0])) names.add(name);
  }
  return [...names].sort();
}

/** `OPENCODE_AOPENCODE_B` as `OPENCODE_A` and `OPENCODE_B`. */
function splitAtPrefix(found: string): string[] {
  return found
    .split(prefix)
    .filter((part) => part !== "")
    .map((part) => `${prefix}${part}`);
}
