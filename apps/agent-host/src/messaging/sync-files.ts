import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { privateFileAt } from "@halonicjs/adapter-fs-node";
import type { StoredCollection, SyncPersistence } from "@halonicjs/host-paperclip-sync";
import type { MessagingId } from "@halonicjs/ports";

/** The folder in a workspace's messaging cache folder that holds every source's local copy. */
export const syncFolderName = "sync";

const collectionName = /^[a-z][a-z-]{0,39}$/;

/**
 * One source's local copy on disk (`agent-host.paperclip-sync`): a folder in the workspace's
 * messaging cache folder, named by a hash of the source's ID so no ID can name a path, holding one
 * file per collection. Files are 0600 in a 0700 folder, written whole through a rename, and stay
 * plain text, the same boundary as the messaging cache. A file that isn't JSON counts as missing.
 */
export function syncFiles(
  cacheFolder: string,
  source: MessagingId,
  warn: (message: string) => void,
): SyncPersistence {
  const folder = join(cacheFolder, syncFolderName, hashOf(source));
  const fileOf = (name: string) => {
    // Collection names are the provider's constants, such as "inbox"; anything else could name a path.
    if (!collectionName.test(name)) throw new RangeError(`not a collection name: ${name}`);
    return privateFileAt(join(folder, `${name}.json`));
  };
  return {
    load: async (name) => {
      const text = await fileOf(name).read();
      if (text === undefined) return undefined;
      try {
        return JSON.parse(text);
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        warn(`The local copy's ${name} file was read as missing: it isn't JSON (${why}).\n`);
        return undefined;
      }
    },
    save: (name, stored: StoredCollection<unknown>) =>
      fileOf(name).write(`${JSON.stringify(stored)}\n`),
    clear: () => rm(folder, { recursive: true, force: true }),
  };
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
