// Ids and keys of the routine scheduler. Core can't call `crypto.subtle` or
// `TextEncoder`, so the UTF-8 length and the short hash are done
// here. They move to `@halonicjs/std` if another package needs them.

/** The most UTF-8 bytes in a run id or a `Coordination` key (ports). */
const maxIdBytes = 256;

/**
 * The run id of a routine fire: the same workspace, routine and due time
 * always give the same id, so the executor starts it once however often it
 * is asked, and two workspaces sharing a run store never share a run.
 *
 * Normally `routine:<workspace hash>/<routine key>@<due time>`. A routine key
 * so long that the id would go over 256 UTF-8 bytes is hashed as well.
 *
 * @param workspaceId - names the workspace for as long as it exists, the same on every host (never a path)
 */
export function routineRunId(workspaceId: string, key: string, at: Date): string {
  const workspace = shortHash(workspaceId);
  const due = at.toISOString();
  const readable = `routine:${workspace}/${key}@${due}`;
  if (utf8Length(readable) <= maxIdBytes) {
    return readable;
  }
  return `routine:${workspace}/#${shortHash(key)}@${due}`;
}

/** The `Coordination` key that keeps a workspace's last routine tick. */
export function lastTickKey(workspaceId: string): string {
  return `routines/${shortHash(workspaceId)}/last-tick`;
}

const fnvOffset = 0xcbf29ce484222325n;
const fnvPrime = 0x100000001b3n;
const mask64 = (1n << 64n) - 1n;

/**
 * 16 hex digits of FNV-1a (64-bit) over the UTF-8 bytes of a text: short,
 * stable everywhere, and spread well enough that different workspaces or
 * routine keys don't meet. Not for secrets.
 */
export function shortHash(text: string): string {
  let hash = fnvOffset;
  for (const byte of utf8Bytes(text)) {
    hash = ((hash ^ BigInt(byte)) * fnvPrime) & mask64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** How many bytes a text takes in UTF-8. */
export function utf8Length(text: string): number {
  let length = 0;
  for (const _ of utf8Bytes(text)) {
    length++;
  }
  return length;
}

/** The UTF-8 bytes of a text; a lone surrogate becomes U+FFFD, as `TextEncoder` does. */
function* utf8Bytes(text: string): Generator<number> {
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      yield code;
    } else if (code < 0x800) {
      yield 0xc0 | (code >> 6);
      yield 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      yield 0xe0 | (code >> 12);
      yield 0x80 | ((code >> 6) & 0x3f);
      yield 0x80 | (code & 0x3f);
    } else {
      yield 0xf0 | (code >> 18);
      yield 0x80 | ((code >> 12) & 0x3f);
      yield 0x80 | ((code >> 6) & 0x3f);
      yield 0x80 | (code & 0x3f);
    }
  }
}
