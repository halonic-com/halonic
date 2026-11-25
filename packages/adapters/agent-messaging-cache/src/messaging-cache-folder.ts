import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { privateFileAt } from "@halonicjs/adapter-fs-node";
import type { MessagingId, SpendRange } from "@halonicjs/ports";

/** A list a source's cache keeps in a file of its own; a conversation's messages each get one too. */
export type CachedList = "agents" | "conversations" | "inbox" | "work";

/** A `TeamStatus` read whose last answer a team status provider's cache keeps, one file each. */
export type TeamStatusRoute =
  | "parts"
  | "seats"
  | "pull-requests"
  | "merge-queue"
  | `spend-${SpendRange}`;

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
 * source gave can end up in git. A file that is broken or not a cache file
 * counts as missing, and `warn` says which, so one damaged file never stops
 * the reads; an item in it that isn't the source's (or the conversation's) is
 * dropped, so a swapped file can't show one source's items under another.
 */
export class MessagingCacheFolder {
  readonly #folder: string;
  readonly #warn: (message: string) => void;

  constructor(folder: string, workspaceRoots: readonly string[], warn: (message: string) => void) {
    if (!isAbsolute(folder)) {
      throw new Error(`the messaging cache folder must be an absolute path, not ${folder}`);
    }
    const workspace = workspaceRoots.find((root) => isInside(resolve(folder), resolve(root)));
    if (workspace !== undefined) {
      throw new Error(`the messaging cache folder ${folder} is inside the workspace ${workspace}`);
    }
    this.#folder = resolve(folder);
    this.#warn = warn;
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
    await this.#write(source, messagesFileOf(conversation), read);
  }

  /** The source's cached list, or `undefined` when none was saved or its file is broken. */
  async loadList<Item extends { source: MessagingId }>(
    source: MessagingId,
    list: CachedList,
  ): Promise<CachedRead<Item> | undefined> {
    return this.#read<Item>(source, `${list}.json`, (item) => item["source"] === source);
  }

  /** A conversation's cached messages, or `undefined` when none were saved or their file is broken. */
  async loadMessages<Item extends { conversation: MessagingId }>(
    source: MessagingId,
    conversation: MessagingId,
  ): Promise<CachedRead<Item> | undefined> {
    return this.#read<Item>(
      source,
      messagesFileOf(conversation),
      (item) => item["conversation"] === conversation,
    );
  }

  /** Every conversation's cached messages of the source, for a search while it is offline. */
  async loadAllMessages<Item extends { conversation: MessagingId }>(
    source: MessagingId,
  ): Promise<Item[]> {
    const files = await readdir(this.#sourceFolder(source)).catch(noFolderAsEmpty);
    const reads = await Promise.all(
      files
        .filter((file) => file.startsWith(messagesPrefix))
        .map((file) =>
          this.#read<Item>(
            source,
            file,
            (item) =>
              typeof item["conversation"] === "string" &&
              messagesFileOf(item["conversation"]) === file,
          ),
        ),
    );
    return reads.flatMap((read) => read?.items ?? []);
  }

  /** When the source last gave a cached live read; `undefined` before the first or when its file is broken. */
  async lastLiveRead(source: MessagingId): Promise<string | undefined> {
    const path = join(this.#sourceFolder(source), lastLiveReadFile);
    const record = await this.#readJson(path);
    if (record === undefined) return undefined;
    if (!hasAsOf(record)) return this.#missing(path, "it has no asOf time");
    return record.asOf;
  }

  /**
   * Replaces a team status provider's last answer to one read. It is kept
   * under the provider's name, not a source's, because an engine that starts
   * offline knows its providers but not yet their sources.
   */
  async saveTeamStatus<Item>(
    provider: string,
    route: TeamStatusRoute,
    read: CachedRead<Item>,
  ): Promise<void> {
    await privateFileAt(join(this.#teamFolder(provider), `${route}.json`)).write(
      `${JSON.stringify(read)}\n`,
    );
  }

  /** A team status provider's last answer to one read, or `undefined` when none was saved or its file is broken. */
  async loadTeamStatus<Item extends { source: MessagingId }>(
    provider: string,
    route: TeamStatusRoute,
  ): Promise<CachedRead<Item> | undefined> {
    return this.#readAt<Item>(
      join(this.#teamFolder(provider), `${route}.json`),
      (item) => typeof item["source"] === "string",
    );
  }

  /** Deletes every answer kept for the team status provider, as Disconnect does for its source. */
  async clearTeamStatus(provider: string): Promise<void> {
    await rm(this.#teamFolder(provider), { recursive: true, force: true });
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

  /** The file's read, keeping only the items `belongs` accepts; a broken file counts as missing. */
  #read<Item>(
    source: MessagingId,
    file: string,
    belongs: (item: Record<string, unknown>) => boolean,
  ): Promise<CachedRead<Item> | undefined> {
    return this.#readAt(join(this.#sourceFolder(source), file), belongs);
  }

  async #readAt<Item>(
    path: string,
    belongs: (item: Record<string, unknown>) => boolean,
  ): Promise<CachedRead<Item> | undefined> {
    const read = await this.#readJson(path);
    if (read === undefined) return undefined;
    if (!hasAsOf(read)) return this.#missing(path, "it has no asOf time");
    const items = read["items"];
    if (!Array.isArray(items)) return this.#missing(path, "its items are not a list");
    const kept = items.filter((item: unknown) => isRecord(item) && belongs(item));
    if (kept.length < items.length) {
      this.#warn(
        `The messaging cache file ${path} held ${items.length - kept.length} items that aren't its own; they were left out.\n`,
      );
    }
    // The items left are the port's fields as this folder wrote them, in a file only the user can change.
    return { asOf: read.asOf, items: kept as Item[] };
  }

  /** The file's JSON, or `undefined` when there is no file or its text isn't JSON. */
  async #readJson(path: string): Promise<unknown> {
    const text = await privateFileAt(path).read();
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return this.#missing(path, `it isn't JSON (${why})`);
    }
  }

  /** Says why the file at `path` counts as missing, and answers as if there were none. */
  #missing(path: string, why: string): undefined {
    this.#warn(`The messaging cache file ${path} was read as missing: ${why}.\n`);
    return undefined;
  }

  #sourceFolder(source: MessagingId): string {
    return join(this.#folder, hashOf(source));
  }

  /** A folder of its own, so a provider's name can never share one with a source's ID. */
  #teamFolder(provider: string): string {
    return join(this.#folder, "team-status", hashOf(provider));
  }
}

function messagesFileOf(conversation: MessagingId): string {
  return `${messagesPrefix}${hashOf(conversation)}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAsOf(value: unknown): value is { asOf: string } & Record<string, unknown> {
  return isRecord(value) && typeof value["asOf"] === "string";
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
