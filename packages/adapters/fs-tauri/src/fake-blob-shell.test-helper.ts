import { bytesToHex, decodeBase64url, encodeBase64url } from "@halonicjs/std";
import type { BlobRefusal, BlobRefusalKind } from "./blob-commands.ts";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { TauriShell } from "./shell.ts";

const hashPattern = /^[0-9a-f]{64}$/u;

/**
 * A shell that answers the `blob_*` commands as the Rust shell does, written
 * out on its own rather than from the adapter: one blob folder per
 * workspace, each blob kept under the SHA-256 the shell works out itself,
 * and the bytes crossing as base64url. It answers only for a workspace in
 * `opened`, and refuses a hash that isn't 64 lowercase hex characters and
 * data that isn't strict base64url.
 *
 * Every call is kept in `calls`.
 */
export class FakeBlobShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  /** The folders the person opened in the shell. */
  readonly opened: readonly string[];
  readonly #folders = new Map<string, Map<string, Uint8Array>>();
  readonly #granted: boolean;
  #nextRefusal: BlobRefusalKind | undefined;

  /**
   * @param options.opened - the folders the person opened in the shell
   * @param options.granted - whether the page has the capability for the blob commands; the served Studio doesn't
   */
  constructor(options: { opened: readonly string[]; granted?: boolean }) {
    this.opened = [...options.opened];
    this.#granted = options.granted ?? true;
  }

  /** The blobs stored for a workspace, by hash, as the folder on disk holds them. */
  stored(workspace: string): ReadonlyMap<string, Uint8Array> {
    return this.#folder(workspace);
  }

  /** Makes the next call fail this way, before anything is read or written. */
  refuseNext(kind: BlobRefusalKind): void {
    this.#nextRefusal = kind;
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) {
      // What Tauri rejects with for a command the capability doesn't allow: text, not a refusal.
      throw `Command ${command} not allowed by ACL`;
    }
    if (this.#nextRefusal !== undefined) {
      const kind = this.#nextRefusal;
      this.#nextRefusal = undefined;
      throw refusal(kind, `refused by the test (${kind})`);
    }
    const workspace = String(args["workspace"]);
    if (!this.opened.includes(workspace)) {
      throw refusal("folder_not_open", `${workspace} is not an opened folder`);
    }
    const folder = this.#folder(workspace);
    switch (command) {
      case "blob_put":
        return { hash: await this.#put(folder, args["data"]) };
      case "blob_get":
        return this.#get(folder, args["hash"]);
      default:
        throw `Command ${command} not found`;
    }
  }

  async #put(folder: Map<string, Uint8Array>, data: unknown): Promise<string> {
    const bytes = decodeBase64url(String(data));
    if (bytes === undefined) {
      throw refusal("invalid_data", "the data isn't base64url");
    }
    const hash = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    if (!folder.has(hash)) {
      folder.set(hash, bytes);
    }
    return hash;
  }

  #get(folder: Map<string, Uint8Array>, hash: unknown): string | null {
    if (typeof hash !== "string" || !hashPattern.test(hash)) {
      throw refusal("invalid_hash", "the hash isn't 64 lowercase hex characters");
    }
    const bytes = folder.get(hash);
    return bytes === undefined ? null : encodeBase64url(bytes);
  }

  #folder(workspace: string): Map<string, Uint8Array> {
    let folder = this.#folders.get(workspace);
    if (folder === undefined) {
      folder = new Map();
      this.#folders.set(workspace, folder);
    }
    return folder;
  }
}

function refusal(kind: BlobRefusalKind, message: string): BlobRefusal {
  return { kind, message };
}
