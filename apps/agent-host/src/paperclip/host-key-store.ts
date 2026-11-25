import type { PaperclipConnection } from "@halonicjs/format";
import { paperclipOrigin } from "@halonicjs/host-agent-messaging-hub";
import type { PaperclipKeyStore, SavedKey, StoredPaperclipKey } from "./sign-in-calls.ts";

/** What the host's key store reaches. */
export interface HostKeyStoreDeps {
  /**
   * Keeps the key in memory for the workspace's connection, as Studio's
   * hand-over does; answers what puts back the key held before, if any.
   */
  keep(entry: StoredPaperclipKey): (() => void) | undefined;
  /** Starts the connection's provider; it calls nobody until Studio reads or the poller polls. */
  connect(workspace: string, name: string): Promise<void>;
  readConnection(workspace: string, name: string): Promise<PaperclipConnection | undefined>;
  writeConnection(workspace: string, name: string, connection: PaperclipConnection): Promise<void>;
  /** Drops the key kept for the workspace's connection and stops its provider. */
  forget(workspace: string, name: string): Promise<void>;
  removeConnection(workspace: string, name: string): Promise<void>;
}

/**
 * Where an approved sign-in's key goes in the desktop engine: the connection's
 * file, written first for a new connection, then the host's memory, then the
 * connection's provider. The key reaches Studio's keychain only through the
 * approved poll's answer (Liam's option 1, HAL-17439). Any failure throws, and
 * the sign-in flow then revokes the key. When Studio couldn't keep the key,
 * {@link drop} undoes the save, a new connection's file included.
 */
export class HostKeyStore implements PaperclipKeyStore {
  readonly #deps: HostKeyStoreDeps;

  constructor(deps: HostKeyStoreDeps) {
    this.#deps = deps;
  }

  async save(entry: StoredPaperclipKey): Promise<SavedKey> {
    const { workspace, name, address, companyId } = entry;
    const file = await this.#deps.readConnection(workspace, name);
    const createdFile = file === undefined;
    if (file === undefined) {
      await this.#deps.writeConnection(workspace, name, {
        label: newConnectionLabel(address),
        address,
        company: companyId,
      });
    } else if (paperclipOrigin(file.address) !== address || file.company !== companyId) {
      // The file changed while the board approved: keep no key for another server or company.
      throw new Error("The connection file changed during the sign-in.");
    }
    const putBack = this.#deps.keep(entry);
    await this.#deps.connect(workspace, name);
    return putBack === undefined ? { createdFile } : { createdFile, putBack };
  }

  async drop(entry: StoredPaperclipKey, saved: SavedKey): Promise<void> {
    // A connection that was signed in keeps its old key: this sign-in never revoked it.
    if (saved.putBack === undefined) await this.#deps.forget(entry.workspace, entry.name);
    else saved.putBack();
    // Only the file this sign-in wrote: an existing connection keeps its file, signed out.
    if (saved.createdFile) await this.#deps.removeConnection(entry.workspace, entry.name);
  }
}

/**
 * A new connection's label, from its host: `https://paperclip.halonic.com` is
 * "Halonic", so Studio shows "Paperclip · Halonic". A host with no dot, such
 * as `localhost`, is its own label.
 */
export function newConnectionLabel(address: string): string {
  const base = hostBase(address);
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * A new connection's name, its file name without `.yaml`: the host's base in
 * lower case, such as `halonic`, followed by `-2`, `-3`… when a file already
 * has that name.
 *
 * @param taken - the names of the workspace's connection files
 */
export function newConnectionName(address: string, taken: readonly string[]): string {
  const cleaned = hostBase(address)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .slice(0, 48)
    .replace(/-+$/u, "");
  const base = cleaned === "" ? "paperclip" : cleaned;
  if (!taken.includes(base)) return base;
  let number = 2;
  while (taken.includes(`${base}-${number}`)) number++;
  return `${base}-${number}`;
}

/** The part of the host a person recognises: `halonic` in `paperclip.halonic.com`. */
function hostBase(address: string): string {
  const host = new URL(address).hostname;
  const isAddress = /^[\d.]+$/u.test(host) || host.startsWith("[");
  const parts = host.split(".");
  return isAddress || parts.length < 2 ? host : (parts[parts.length - 2] ?? host);
}
