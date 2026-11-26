import type { Message } from "@halonicjs/ports";
import { asRecord, asRecords, field, text } from "./json.ts";
import { authorOf, type MapContext } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { bodyOf } from "./transport.ts";

/**
 * Marks the front bot's comments on a chat as the chat agent's automatic messages
 * (`paperclip-client.bot-notes`, HAL-19646). A plugin posts with no author, so Paperclip
 * lists the bot's lines like a person's; the agent-tools plugin's `chat-notes` route names the
 * ids it posted. Only those ids are marked: a comment that merely looks like the bot's, such as
 * one starting with its `*Assistant:*` prefix, stays a person's.
 */
export class PaperclipBotNotes {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #warn: ((message: string) => void) | undefined;

  constructor(
    reader: PaperclipReader,
    company: string,
    warn: ((message: string) => void) | undefined,
  ) {
    this.#reader = reader;
    this.#company = company;
    this.#warn = warn;
  }

  /**
   * `messages` of chat task `task`, each the bot posted given as an automatic message from the
   * chat's agent `agentId`. The route is read only when a message has no agent or user author.
   * When it fails, the messages stay as they are and the failure goes to `warn`, so the chat still
   * shows; with no `warn`, it is thrown. A 404 means the plugin isn't installed: nothing to mark.
   */
  async mark(
    context: MapContext,
    task: string,
    agentId: string,
    messages: readonly Message[],
  ): Promise<readonly Message[]> {
    if (!messages.some((message) => message.author.kind === "person")) {
      return messages;
    }
    let posted: ReadonlySet<string>;
    try {
      posted = await this.#postedOn(task);
    } catch (error) {
      if (this.#warn === undefined) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      this.#warn(`Couldn't read the front bot's notes on a Paperclip chat: ${reason}`);
      return messages;
    }
    const author = authorOf(context, agentId, undefined);
    return messages.map((message) => {
      const [, comment] = context.ids.read(message.id, "comment") ?? [];
      const bots = message.author.kind === "person" && comment !== undefined && posted.has(comment);
      return bots ? { ...message, author, automatic: true } : message;
    });
  }

  /** The ids of the comments the bot posted on `task`. */
  async #postedOn(task: string): Promise<ReadonlySet<string>> {
    const details = { path: { task }, query: { companyId: this.#company } };
    const answer = await this.#reader.send("chatNotes", details);
    if (answer.kind === "failed" && answer.failure === "not-found") {
      return new Set();
    }
    const notes = asRecords(field(asRecord(bodyOf("chatNotes", answer)), "automaticNotes"));
    return new Set(notes.flatMap((note) => text(note, "commentId") ?? []));
  }
}
