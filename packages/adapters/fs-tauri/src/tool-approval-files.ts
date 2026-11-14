/** An approval's file name: the SHA-256 of the tool's name, then `.json`. */
export const approvalFile = /^[0-9a-f]{64}\.json$/u;

/** The file in a source's folder that holds its waiting versions. */
export const waitingFile = "waiting.json";

/**
 * The hash of text's UTF-16 code units, little-endian, as `fs-node` names
 * approval files. UTF-8 would turn every lone surrogate into U+FFFD, so two
 * different names would share one file.
 */
export async function hashText(text: string): Promise<string> {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index += 1) {
    view.setUint16(index * 2, text.charCodeAt(index), true);
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The tool an approval file is for, read from its text, or `undefined` when
 * it can't be read there. It is only believed when its hash is the file's
 * name, so a damaged file can't name another tool.
 */
export async function nameIn(entry: string, text: string): Promise<string | undefined> {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch {
    return undefined;
  }
  const name = (record as { name?: unknown } | null)?.name;
  if (typeof name !== "string") return undefined;
  return `${await hashText(name)}.json` === entry ? name : undefined;
}
