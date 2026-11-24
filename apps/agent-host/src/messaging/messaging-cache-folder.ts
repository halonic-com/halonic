import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { MessagingId } from "@halonicjs/ports";
import { privateFileAt } from "../remote/private-file.ts";

/** A list a source's cache keeps in a file of its own; a conversation's messages each get one too. */
export type CachedList = "agents" | "conversations" | "inbox" | "work";

/** What one cache file holds: the items of one live read, and the time the source gave them. */
export interface CachedRead<Item> {
  asOf: string;
  items: Item[];
}

const messagesPrefix = "messages-";
const lastLiveReadFile = "as-of.json";

/**
 * The messaging cache's folder in the app data folder: one folder per source,
 * named by a hash of its ID so no ID can name a path, holding files only the
 * user can read (0600 in a 0700 folder; on Windows the user's profile folder
 * keeps them private). It refuses a folder inside a workspace, so nothing a
 * source gave can end up in git.
 */
export class MessagingCacheFolder {
  readonly #folder: string;

  constructor(folder: string, workspaceRoots: readonly string[]) {
    if (!isAbsolute(folder)) {
      throw new Error(`the messaging cache folder must be an absolute path, not ${folder}`);
    }
    const workspace = workspaceRoots.find((root) => isInside(resolve(folder), resolve(root)));
    if (workspace !== undefined) {
      throw new Error(`the messaging cache folder ${folder} is inside the workspace ${workspace}`);
    }
    this.#folder = resolve(folder);
  }

  /** Replaces the source's cached list, and records `read.asOf` as its last live read. */
  async saveList<Item>(
    source: MessagingId,
    list: CachedList,
    read: CachedRead<Item>,
  ): Promise<void> {
    await this.#write(source, `${list}.json`, read);
  }

  /** Replaces a conversation's cached messages, and records `read.asOf` as its source's last live read. */
  async saveMessages<Item>(
    source: MessagingId,
    conversation: MessagingId,
    read: CachedRead<Item>,
  ): Promise<void> {
    await this.#write(source, `${messagesPrefix}${hashOf(conversation)}.json`, read);
  }

  /** The source's cached list, or `undefined` when none was saved. */
  async loadList<Item>(
    source: MessagingId,
    list: CachedList,
  ): Promise<CachedRead<Item> | undefined> {
    return this.#read(source, `${list}.json`);
  }

  /** A conversation's cached messages, or `undefined` when none were saved. */
  async loadMessages<Item>(
    source: MessagingId,
    conversation: MessagingId,
  ): Promise<CachedRead<Item> | undefined> {
    return this.#read(source, `${messagesPrefix}${hashOf(conversation)}.json`);
  }

  /** Every conversation's cached messages of the source, for a search while it is offline. */
  async loadAllMessages<Item>(source: MessagingId): Promise<Item[]> {
    const files = await readdir(this.#sourceFolder(source)).catch(noFolderAsEmpty);
    const reads = await Promise.all(
      files
        .filter((file) => file.startsWith(messagesPrefix))
        .map((file) => this.#read<Item>(source, file)),
    );
    return reads.flatMap((read) => read?.items ?? []);
  }

  /** When the source last gave a live read that was cached, or `undefined` before the first. */
  async lastLiveRead(source: MessagingId): Promise<string | undefined> {
    const path = join(this.#sourceFolder(source), lastLiveReadFile);
    const record = await readJson(path);
    if (record === undefined) return undefined;
    if (!hasAsOf(record)) throw new Error(`the messaging cache file ${path} is not a cache file`);
    return record.asOf;
  }

  /** Deletes everything cached for the source. */
  async clear(source: MessagingId): Promise<void> {
    await rm(this.#sourceFolder(source), { recursive: true, force: true });
  }

  async #write<Item>(source: MessagingId, file: string, read: CachedRead<Item>): Promise<void> {
    const folder = this.#sourceFolder(source);
    await privateFileAt(join(folder, file)).write(`${JSON.stringify(read)}\n`);
    await privateFileAt(join(folder, lastLiveReadFile)).write(
      `${JSON.stringify({ asOf: read.asOf })}\n`,
    );
  }

  async #read<Item>(source: MessagingId, file: string): Promise<CachedRead<Item> | undefined> {
    const path = join(this.#sourceFolder(source), file);
    const read = await readJson(path);
    if (read === undefined) return undefined;
    if (!hasAsOf(read) || !Array.isArray(read["items"])) {
      throw new Error(`the messaging cache file ${path} is not a cache file`);
    }
    // The items are the port's fields as this folder wrote them, in a file only the user can change.
    return { asOf: read.asOf, items: read["items"] as Item[] };
  }

  #sourceFolder(source: MessagingId): string {
    return join(this.#folder, hashOf(source));
  }
}

/** The file's JSON, or `undefined` when there is no file. */
async function readJson(path: string): Promise<unknown> {
  const text = await privateFileAt(path).read();
  return text === undefined ? undefined : JSON.parse(text);
}

function hasAsOf(value: unknown): value is { asOf: string } & Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>)["asOf"] === "string";
}

function isInside(folder: string, root: string): boolean {
  const path = relative(root, folder);
  return path === "" || !(path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path));
}

function hashOf(id: MessagingId): string {
  return createHash("sha256").update(id).digest("hex");
}

/** A source with nothing cached yet has no folder, which is no error. */
function noFolderAsEmpty(error: unknown): string[] {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
  throw error;
}
