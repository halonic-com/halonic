import type { Message, MessagingId } from "@halonicjs/ports";
import { asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";
import { authorOf, type MapContext } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { bodyOf } from "./transport.ts";

/** The chat a note list is for: its task, its agent and its conversation's ID. */
export interface BotNotesChat {
  readonly task: string;
  readonly agent: string;
  readonly conversation: MessagingId;
}

/** What the `chat-notes` route lists for one task. */
interface ChatNotes {
  /** The ids of the comments the bot posted. */
  readonly posted: ReadonlySet<string>;
  /** The progress notes of the task's newest watched run, oldest first. */
  readonly progress: readonly ProgressNote[];
}

interface ProgressNote {
  readonly runId: string;
  readonly at: string;
  readonly text: string;
}

/** The plugin drops progress notes a day after the newest one, so an older chat has none. */
const progressKeptMs = 24 * 60 * 60_000;

const none: ChatNotes = { posted: new Set(), progress: [] };

/**
 * Marks the front bot's comments on a chat as the chat agent's automatic messages
 * (`paperclip-client.bot-notes`, HAL-19646), and adds its progress notes
 * (`paperclip-client.progress-notes`, HAL-19714). A plugin posts with no author, so Paperclip
 * lists the bot's lines like a person's; the agent-tools plugin's `chat-notes` route names the
 * ids it posted. Only those ids are marked: a comment that merely looks like the bot's, such as
 * one starting with its `*Assistant:*` prefix, stays a person's. Progress notes are never
 * comments: the route serves them, and each becomes an automatic message in plain text.
 */
export class PaperclipBotNotes {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #warn: ((message: string) => void) | undefined;
  readonly #now: () => Date;

  constructor(
    reader: PaperclipReader,
    company: string,
    warn: ((message: string) => void) | undefined,
    now: () => Date,
  ) {
    this.#reader = reader;
    this.#company = company;
    this.#warn = warn;
    this.#now = now;
  }

  /**
   * `messages` of `chat`, each the bot posted given as an automatic message from the chat's
   * agent, with the bot's progress notes added in time order. The route is read only when a
   * message has no agent or user author, or the person wrote in the last day. When it fails, the
   * messages stay as they are and the failure goes to `warn`, so the chat still shows; with no
   * `warn`, it is thrown. A 404 means the plugin isn't installed: nothing to mark or add.
   */
  async mark(
    context: MapContext,
    chat: BotNotesChat,
    messages: readonly Message[],
  ): Promise<readonly Message[]> {
    if (!this.#mayHaveNotes(messages)) {
      return messages;
    }
    let notes: ChatNotes;
    try {
      notes = await this.#notesOn(chat.task);
    } catch (error) {
      if (this.#warn === undefined) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      this.#warn(`Couldn't read the front bot's notes on a Paperclip chat: ${reason}`);
      return messages;
    }
    const author = authorOf(context, chat.agent, undefined);
    const marked = messages.map((message) => {
      const [, comment] = context.ids.read(message.id, "comment") ?? [];
      const bots =
        message.author.kind === "person" && comment !== undefined && notes.posted.has(comment);
      return bots ? { ...message, author, automatic: true } : message;
    });
    if (notes.progress.length === 0) {
      return marked;
    }
    const progress = notes.progress.map(
      (note, index): Message => ({
        id: context.ids.make("progress-note", chat.task, note.runId, String(index)),
        conversation: chat.conversation,
        author,
        body: note.text,
        attachments: [],
        sentAt: note.at,
        automatic: true,
        plainText: true,
      }),
    );
    // Stable: a note and a comment at the same instant keep the comment first.
    return [...marked, ...progress].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  }

  /** A bot comment needs a comment with no author; a progress note, the person's recent message. */
  #mayHaveNotes(messages: readonly Message[]): boolean {
    const since = this.#now().getTime() - progressKeptMs;
    return messages.some(
      (message) =>
        message.author.kind === "person" ||
        (message.author.kind === "me" && Date.parse(message.sentAt) >= since),
    );
  }

  /** The ids of the comments the bot posted on `task`, and its progress notes there. */
  async #notesOn(task: string): Promise<ChatNotes> {
    const details = { path: { task }, query: { companyId: this.#company } };
    const answer = await this.#reader.send("chatNotes", details);
    if (answer.kind === "failed" && answer.failure === "not-found") {
      return none;
    }
    const body = asRecord(bodyOf("chatNotes", answer));
    const posted = asRecords(field(body, "automaticNotes"));
    return {
      posted: new Set(posted.flatMap((note) => text(note, "commentId") ?? [])),
      progress: progressOf(asRecord(field(body, "progressNotes"))),
    };
  }
}

/** The route's `progressNotes`, `{ runId, notes: [{ at, text }] }` or `null`; a broken note is left out. */
function progressOf(record: JsonRecord | undefined): readonly ProgressNote[] {
  const runId = text(record, "runId");
  if (runId === undefined) {
    return [];
  }
  return asRecords(field(record, "notes")).flatMap((note) => {
    const at = text(note, "at");
    const words = text(note, "text");
    const valid = at !== undefined && words !== undefined && !Number.isNaN(Date.parse(at));
    return valid && words.trim() !== "" ? [{ runId, at, text: words }] : [];
  });
}
