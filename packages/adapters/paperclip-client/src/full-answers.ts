import type { FullAnswer, Message } from "@halonicjs/ports";
import { asRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { bodyOf } from "./transport.ts";

/** The one document key a full answer has on its chat task, as the chat agents' rule names it. */
export const fullAnswerKey = "full-answer";

/** The largest full answer kept, in UTF-8 bytes; a larger document is left out. */
export const fullAnswerMaxBytes = 64 * 1024;

/** A link to a task's document, as Paperclip writes it: `/HAL/issues/HAL-42#document-full-answer`. */
const documentLink = /\/issues\/([A-Za-z0-9._~-]+)#document-([A-Za-z0-9._~-]+)/g;

/** One document a message links: the task as the link names it (ID or identifier), and the key. */
interface DocumentLink {
  task: string;
  key: string;
}

/** Every document link in `body`, in the order they appear. */
export function documentLinks(body: string): DocumentLink[] {
  return [...body.matchAll(documentLink)].flatMap(([, task, key]) =>
    task === undefined || key === undefined ? [] : [{ task, key }],
  );
}

/**
 * Adds the full answer to each agent reply on a chat that links the chat task's own `full-answer`
 * document (`paperclip-client.full-answers`). It reads that one document once per list, and only
 * when such a reply is there; no other document is ever read. The task's identifier, which links
 * usually name, is read once and kept.
 */
export class PaperclipFullAnswers {
  readonly #reader: PaperclipReader;
  readonly #warn: ((message: string) => void) | undefined;
  readonly #identifiers = new Map<string, string | undefined>();

  constructor(reader: PaperclipReader, warn: ((message: string) => void) | undefined) {
    this.#reader = reader;
    this.#warn = warn;
  }

  /**
   * `messages` of chat task `task`, each agent reply that links its full answer with it as
   * `fullAnswer`. When a read fails, the replies stay as they are and the failure is reported
   * through `warn`, so the chat still shows; with no `warn`, the failure is thrown.
   */
  async add(task: string, messages: readonly Message[]): Promise<readonly Message[]> {
    const linked = messages.flatMap(linksOf);
    if (linked.length === 0) {
      return messages;
    }
    let names: ReadonlySet<string>;
    let answer: FullAnswer | undefined;
    try {
      names = await this.#namesOf(task, linked);
      answer = names.size === 0 ? undefined : await this.#read(task);
    } catch (error) {
      if (this.#warn === undefined) {
        throw error;
      }
      // The reason only: a document's text never goes into the report.
      const reason = error instanceof Error ? error.message : String(error);
      this.#warn(`Couldn't read the full answer of a Paperclip chat: ${reason}`);
      return messages;
    }
    if (answer === undefined) {
      return messages;
    }
    const fullAnswer = answer;
    return messages.map((message) =>
      linksOf(message).some((link) => names.has(link.task)) ? { ...message, fullAnswer } : message,
    );
  }

  /**
   * The names among `linked` that are chat task `task`'s: its ID, and its identifier, which is
   * read only when a link names the task some other way.
   */
  async #namesOf(task: string, linked: readonly DocumentLink[]): Promise<ReadonlySet<string>> {
    const byOtherName = linked.some((link) => link.task !== task);
    if (byOtherName && !this.#identifiers.has(task)) {
      const record = asRecord(await this.#reader.read("getTask", { path: { task } }));
      this.#identifiers.set(task, text(record, "identifier"));
    }
    const own = [task, this.#identifiers.get(task)];
    return new Set(linked.map((link) => link.task).filter((name) => own.includes(name)));
  }

  /** The chat task's full answer; `undefined` when it has none or it isn't a small Markdown text. */
  async #read(task: string): Promise<FullAnswer | undefined> {
    const answer = await this.#reader.send("readFullAnswer", { path: { task } });
    if (answer.kind === "failed" && answer.failure === "not-found") {
      return undefined;
    }
    const record = asRecord(bodyOf("readFullAnswer", answer));
    const markdown = text(record, "body");
    const fits =
      markdown !== undefined &&
      text(record, "format") === "markdown" &&
      new TextEncoder().encode(markdown).byteLength <= fullAnswerMaxBytes;
    return fits ? { key: fullAnswerKey, title: text(record, "title") ?? "", markdown } : undefined;
  }
}

/** The full-answer links an agent's own reply makes; none for the person's or automatic notes. */
function linksOf(message: Message): DocumentLink[] {
  if (message.author.kind !== "agent" || message.automatic === true) {
    return [];
  }
  return documentLinks(message.body).filter((link) => link.key === fullAnswerKey);
}
