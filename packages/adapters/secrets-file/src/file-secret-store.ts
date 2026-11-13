import { randomUUID } from "node:crypto";
import { lstat, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  makePrivateFolder,
  readUnlinkedFile,
  renameOver,
  writeFlushedFile,
} from "@halonicjs/adapter-fs-node";
import { checkSecretValue, type SecretStore, secretKey } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { parseSecretsFile, type SecretEntry, secretsFileText } from "./secrets-file-format.ts";

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
export class FileSecretStore implements SecretStore {
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
      entries.set(key, { name, value });
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

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}
