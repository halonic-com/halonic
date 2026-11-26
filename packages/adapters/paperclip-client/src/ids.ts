import type { MessagingId } from "@halonicjs/ports";

/** What a Paperclip item is, in the provider's own IDs. */
export type PaperclipItemKind =
  | "agent"
  | "chat"
  | "channel"
  | "comment"
  | "card"
  | "approval"
  | "decision"
  | "secret-proposal"
  | "join-request"
  | "task"
  | "project"
  | "seat"
  | "pull"
  | "avatar"
  | "attachment"
  | "run";

const provider = "paperclip";
const partCounts: Readonly<Record<PaperclipItemKind, number>> = {
  agent: 1,
  chat: 1,
  // A channel: its parent task.
  channel: 1,
  comment: 2,
  card: 2,
  approval: 1,
  decision: 1,
  "secret-proposal": 1,
  "join-request": 1,
  task: 1,
  project: 1,
  seat: 1,
  // A pull request: its repository (`owner/name`) and its number.
  pull: 2,
  // An agent's picture: its path under `/api/agent-avatars/` as one part, never the whole path.
  avatar: 1,
  // A file on a task, shown on that task's card or approval: the task and the file.
  attachment: 2,
  run: 1,
};

/**
 * Makes and reads the opaque IDs of one connection: `paperclip:<connection>:<kind>:<id>…`,
 * each part URI-encoded. Apps only compare them and hand them back; only
 * this provider reads them, and it reads only its own connection's.
 */
export class PaperclipIds {
  readonly #connection: string;

  constructor(connection: string) {
    this.#connection = connection;
  }

  /** The source's own ID. */
  source(): MessagingId {
    return `${provider}:${encodeURIComponent(this.#connection)}`;
  }

  /** The opaque ID of a Paperclip item. */
  make(kind: PaperclipItemKind, ...ids: readonly string[]): MessagingId {
    return [this.source(), kind, ...ids.map((id) => encodeURIComponent(id))].join(":");
  }

  /**
   * Paperclip's IDs inside `id` when it is this connection's and of `kind`,
   * otherwise `undefined`. The parts are returned as they were made; the
   * request list still checks each one before it goes into a path.
   */
  read(id: MessagingId, kind: PaperclipItemKind): readonly string[] | undefined {
    const prefix = `${this.source()}:${kind}:`;
    if (!id.startsWith(prefix)) {
      return undefined;
    }
    const parts = id.slice(prefix.length).split(":");
    if (parts.length !== partCounts[kind]) {
      return undefined;
    }
    try {
      return parts.map((part) => decodeURIComponent(part));
    } catch {
      // A broken escape isn't an ID this provider made.
      return undefined;
    }
  }
}

/**
 * The ID of connection `connection`'s source, as its provider lists it. The
 * engine clears the source's cache by it on Disconnect, also when no provider
 * runs for the connection.
 *
 * @example
 * paperclipSourceId("halonic"); // "paperclip:halonic"
 */
export function paperclipSourceId(connection: string): MessagingId {
  return new PaperclipIds(connection).source();
}
