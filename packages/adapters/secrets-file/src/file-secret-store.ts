import { randomUUID } from "node:crypto";
import { lstat, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  makePrivateFolder,
  readUnlinkedFile,
  renameOver,
  writeFlushedFile,
} from "@halonicjs/adapter-fs-node";
import {
  checkSecretValue,
  type KeyOrigins,
  maxAllowedOrigins,
  type SecretStore,
  secretKey,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import {
  originOf,
  parseSecretsFile,
  type SecretEntry,
  secretsFileText,
} from "./secrets-file-format.ts";

/**
 * The secrets a person sets with `halonic secret`, in one JSON file in their
 * profile, such as the `secretsFile` of `@halonicjs/profile`.
 *
 * - **Private:** the file's folder is made `0700` and the file is created
 *   `0600`, with that mode when it is opened, never changed afterwards. On
 *   Linux and macOS a file that group or others can read is refused, with the
 *   fix; Windows has no such check, and the profile folder's own permissions
 *   protect the file there.
 * - **Whole:** a save writes a temporary file in the same folder, flushes it
 *   and renames it over the secrets file, so a reader finds the old secrets
 *   or the new, never half of them.
 * - **Not followed:** a file that is a link is refused, so the secrets can't
 *   be read from or written into a file elsewhere.
 * - **Shared by name only:** two programs that save at the same moment each
 *   read, change and write the whole file, so the later save wins and may
 *   drop the earlier one's change. There is no lock; `halonic secret` is run
 *   by hand, one command at a time.
 *
 * A value never appears in an error: a damaged file is reported by its
 * location and fix, never by its content.
 */
export class FileSecretStore implements SecretStore, KeyOrigins {
  readonly #file: string;
  #queue: Promise<unknown> = Promise.resolve();

  /** @param file - the secrets file; its folder is created on the first save */
  constructor(file: string) {
    this.#file = resolve(file);
  }

  async get(name: string): Promise<string | null> {
    const key = secretKey(name);
    return (await this.#load()).get(key)?.value ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    const key = secretKey(name);
    checkSecretValue(value);
    await this.#exclusively(async () => {
      const entries = await this.#load();
      // A new value keeps the key's allowed origins: changing a key must not unbind it.
      entries.set(key, { ...entries.get(key), name, value });
      await this.#save(entries);
    });
  }

  async allowedOrigins(name: string): Promise<readonly string[] | undefined> {
    const key = secretKey(name);
    return (await this.#load()).get(key)?.allowedOrigins;
  }

  /**
   * Records the origins a stored key may be sent to, replacing the ones it
   * had. Each is reduced to its scheme, host and port, so a path is dropped
   * and two spellings of one origin are one; repeats are dropped.
   *
   * @throws RangeError when the name breaks the rule, no secret is stored
   *   under it, the list is empty or longer than {@link maxAllowedOrigins}, or
   *   an address isn't an `http` or `https` address without user info; the
   *   message never repeats an address
   */
  async setAllowedOrigins(name: string, addresses: readonly string[]): Promise<void> {
    const key = secretKey(name);
    const origins = [...new Set(addresses.map(originOfAddress))];
    if (origins.length === 0 || origins.length > maxAllowedOrigins) {
      throw new RangeError(`A key may be allowed 1 to ${maxAllowedOrigins} origins.`);
    }
    await this.#exclusively(async () => {
      const entries = await this.#load();
      const entry = entries.get(key);
      if (entry === undefined) {
        throw new RangeError("There is no stored secret with that name to allow an origin for.");
      }
      entries.set(key, { ...entry, allowedOrigins: origins });
      await this.#save(entries);
    });
  }

  async remove(name: string): Promise<void> {
    const key = secretKey(name);
    await this.#exclusively(async () => {
      const entries = await this.#load();
      if (entries.delete(key)) {
        await this.#save(entries);
      }
    });
  }

  async names(): Promise<readonly string[]> {
    const entries = await this.#load();
    // Keys are upper-case ASCII, so the default sort gives the same order on every system.
    return [...entries.keys()].sort().map((key) => (entries.get(key) as SecretEntry).name);
  }

  /** Runs saves one after another in this process, so two of them never read the same old file. */
  #exclusively<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #load(): Promise<Map<string, SecretEntry>> {
    const stats = await lstat(this.#file).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (stats === null) {
      return new Map();
    }
    // A link has the mode of the link, not of its target; `readUnlinkedFile` refuses it below.
    if (process.platform !== "win32" && !stats.isSymbolicLink() && (stats.mode & 0o077) !== 0) {
      throw new KindedError(
        "denied",
        `The secrets file ${this.#file} can be read by other users.`,
        {
          fix: `Run chmod 600 ${this.#file}, then run again.`,
        },
      );
    }
    return parseSecretsFile(await readUnlinkedFile(this.#file), this.#file);
  }

  async #save(entries: ReadonlyMap<string, SecretEntry>): Promise<void> {
    const folder = dirname(this.#file);
    await makePrivateFolder(folder);
    const temporary = join(folder, `.secrets-${randomUUID()}.tmp`);
    try {
      await writeFlushedFile(temporary, secretsFileText(entries), { mode: 0o600 });
      await renameOver(temporary, this.#file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

function originOfAddress(address: string): string {
  const origin = originOf(address);
  if (origin === undefined) {
    throw new RangeError("An allowed origin must be an http or https address without user info.");
  }
  return origin;
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}
