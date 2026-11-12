// Where `FileToolApprovalStore` keeps its files, written out once for the
// tests that read, damage or copy them.

import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ToolApprovalKey } from "@halonicjs/ports";

/** The SHA-256 of `text` as UTF-16, in hex, as the store names its folders and files. */
export function hash(text: string): string {
  return createHash("sha256").update(text, "utf16le").digest("hex");
}

/** The folder `FileToolApprovalStore` keeps one source's files in. */
export function folderFor(root: string, key: Omit<ToolApprovalKey, "name">): string {
  return join(root, hash(JSON.stringify([key.location, key.source])));
}

/** The file `FileToolApprovalStore` keeps the approval for `key` in. */
export function fileFor(root: string, key: ToolApprovalKey): string {
  return join(folderFor(root, key), `${hash(key.name)}.json`);
}
