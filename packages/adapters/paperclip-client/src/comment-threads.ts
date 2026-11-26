import { asRecords, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";

/** How many of a thread's newest comments are kept, and the size of each page read. */
const threadPage = 100;

/**
 * How many reads of a thread use `after` before one reads it whole again. `after` sees only new
 * comments, so an older comment deleted or blanked in Paperclip shows until that whole read.
 */
const deltasPerWholeRead = 10;

/** One task's comments as last read. */
interface Thread {
  comments: readonly JsonRecord[];
  /** Reads with `after` since the thread was last read whole. */
  deltas: number;
}

/**
 * The comments of the tasks read so far, oldest first (`paperclip-client.delta-reads`): the
 * newest page on the first read of a task, then only the comments after the ones kept.
 */
export class PaperclipCommentThreads {
  readonly #reader: PaperclipReader;
  readonly #threads = new Map<string, Thread>();

  constructor(reader: PaperclipReader) {
    this.#reader = reader;
  }

  /** Task `task`'s newest comments, oldest first. */
  async read(task: string): Promise<readonly JsonRecord[]> {
    const known = this.#threads.get(task);
    const added =
      known === undefined || known.deltas >= deltasPerWholeRead
        ? undefined
        : await this.#after(task, known.comments);
    const thread: Thread =
      added === undefined || known === undefined
        ? { comments: await this.#newest(task), deltas: 0 }
        : { comments: [...known.comments, ...added].slice(-threadPage), deltas: known.deltas + 1 };
    this.#threads.set(task, thread);
    return thread.comments;
  }

  async #newest(task: string): Promise<JsonRecord[]> {
    const body = await this.#reader.read("listComments", {
      path: { task },
      query: { order: "desc", limit: String(threadPage) },
    });
    return asRecords(body).reverse();
  }

  /**
   * The comments after `kept`, page by page, or `undefined` when the thread must be read whole.
   * It reads after the second-newest kept comment and expects the newest back first: Paperclip
   * answers `after` an ID it has deleted with nothing, which would otherwise look like no news.
   */
  async #after(task: string, kept: readonly JsonRecord[]): Promise<JsonRecord[] | undefined> {
    const anchor = text(kept.at(-2), "id");
    const newest = text(kept.at(-1), "id");
    if (anchor === undefined || newest === undefined) {
      return undefined;
    }
    const added: JsonRecord[] = [];
    let after = anchor;
    for (;;) {
      const page = asRecords(
        await this.#reader.read("listComments", {
          path: { task },
          query: { after, order: "asc", limit: String(threadPage) },
        }),
      );
      added.push(...page);
      const last = text(page.at(-1), "id");
      if (page.length < threadPage || last === undefined) {
        break;
      }
      after = last;
    }
    const [first, ...rest] = added;
    return text(first, "id") === newest ? rest : undefined;
  }
}
