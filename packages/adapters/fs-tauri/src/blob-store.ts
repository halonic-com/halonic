import { type BlobRef, type BlobStore, checkBlobMediaType, isBlobHash } from "@halonicjs/ports";
import { decodeBase64url, type ErrorKind, encodeBase64url, KindedError } from "@halonicjs/std";
import { type BlobRefusalKind, blobCommands, isBlobRefusal } from "./blob-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Blobs for the Studio desktop app: every call goes to one of the shell's
 * `blob_*` commands, which keep the blobs in the profile's blob folder for
 * the workspace, the same files the CLI's `FolderBlobStore` reads and
 * writes. So a blob the desktop app stored is there for `halonic`, and the
 * other way round.
 *
 * The page names the workspace, never a path, and the shell answers only for
 * a workspace the person opened in it. The port's rules for media types and
 * hashes are checked here, so a refused call never reaches the shell; the
 * shell hashes the bytes itself, so a file always holds what its name says.
 * The media type isn't kept, as the port allows.
 */
export class TauriBlobStore implements BlobStore {
  readonly #shell: TauriShell;
  readonly #workspace: string;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param workspace - the workspace folder, as the person opened it in the shell
   */
  constructor(shell: TauriShell, workspace: string) {
    this.#shell = shell;
    this.#workspace = workspace;
  }

  async put(data: Uint8Array, mediaType: string): Promise<BlobRef> {
    checkBlobMediaType(mediaType);
    // Encoded before the first wait, so a caller changing `data` afterwards can't change what is stored.
    const encoded = encodeBase64url(data);
    const answer = await this.#call(blobCommands.put, { data: encoded });
    const hash = (answer as { hash?: unknown } | null)?.hash;
    if (typeof hash !== "string" || !isBlobHash(hash)) {
      throw noAnswer();
    }
    return { hash, size: data.byteLength, mediaType };
  }

  async get(hash: string): Promise<Uint8Array | null> {
    if (!isBlobHash(hash)) {
      return null;
    }
    const answer = await this.#call(blobCommands.get, { hash });
    if (answer === null) {
      return null;
    }
    const bytes = typeof answer === "string" ? decodeBase64url(answer) : undefined;
    if (bytes === undefined) {
      throw noAnswer();
    }
    return bytes;
  }

  /** Runs one command on this store's blob folder, turning a refusal into an error. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, { workspace: this.#workspace, ...args });
    } catch (reason) {
      throw blobFailure(reason);
    }
  }
}

/** How a surface should respond to each refusal other than `linked_blob`. */
const errorKinds: Readonly<Record<Exclude<BlobRefusalKind, "linked_blob">, ErrorKind>> = {
  folder_not_open: "denied",
  // The page checked the hash and encoded the bytes, so a refusal is our bug.
  invalid_hash: "internal",
  invalid_data: "internal",
  io: "unavailable",
};

/**
 * The error a rejected `blob_*` command becomes. A linked blob is a plain
 * `Error` with the shell's message, which names the file or folder, as
 * `FolderBlobStore` throws for one. Anything that isn't the shell's refusal
 * shape (a missing capability, a broken IPC call) is `unavailable`, and its
 * text is dropped: the adapter can't vouch for it.
 */
function blobFailure(reason: unknown): Error {
  if (!isBlobRefusal(reason)) {
    return noAnswer();
  }
  if (reason.kind === "linked_blob") {
    return new Error(reason.message, { cause: reason });
  }
  return new KindedError(
    errorKinds[reason.kind],
    `The blob store refused the call: ${reason.message}`,
  );
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the blob call.");
}
