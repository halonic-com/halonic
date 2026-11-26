import { asRecords, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { PaperclipClientError } from "./transport.ts";

/** How many of a thread's newest comments are kept, and the size of each page read. */
const threadPage = 100;

/**
 * One read of a thread in this many reads its newest page whole. `after` sees only the comments
 * after its anchor, so an older comment deleted or blanked in Paperclip shows until that read.
 */
const readsPerWholeRead = 10;

/** One task's comments as last read. */
interface Thread {
  comments: readonly JsonRecord[];
  /** Reads with `after` since the thread was last read whole. */
  deltas: number;
}

/**
 * The comments of the tasks read so far, oldest first (`paperclip-client.delta-reads`): the
 * newest page on the first read of a task, then only the comments after the ones kept, with
 * the newest page read whole again once in every 10 reads.
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
    const fromNewest =
      known === undefined || known.deltas >= readsPerWholeRead - 1
        ? undefined
        : await this.#after(task, known.comments);
    // `fromNewest` starts with the newest kept comment's current copy, so a delete shows at once.
    const thread: Thread =
      fromNewest === undefined || known === undefined
        ? { comments: await this.#newest(task), deltas: 0 }
        : {
            comments: [...known.comments.slice(0, -1), ...fromNewest].slice(-threadPage),
            deltas: known.deltas + 1,
          };
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
   * The newest kept comment as Paperclip has it now, then the comments after it, page by page;
   * or `undefined` when the thread must be read whole. It reads after the second-newest kept
   * comment and expects the newest back first: Paperclip answers `after` a comment that is gone
   * with nothing, which would otherwise look like no news.
   */
  async #after(task: string, kept: readonly JsonRecord[]): Promise<JsonRecord[] | undefined> {
    const anchor = text(kept.at(-2), "id");
    const newest = text(kept.at(-1), "id");
    if (anchor === undefined || newest === undefined) {
      return undefined;
    }
    const read: JsonRecord[] = [];
    let after = anchor;
    for (;;) {
      const page = asRecords(
        await this.#reader.read("listComments", {
          path: { task },
          query: { after, order: "asc", limit: String(threadPage) },
        }),
      );
      read.push(...page);
      if (page.length < threadPage) {
        break;
      }
      after = nextAfter(page, after);
    }
    return text(read[0], "id") === newest ? read : undefined;
  }
}

/** The last comment ID on a full page, which the next page starts after; throws when paging can't move on. */
function nextAfter(page: readonly JsonRecord[], sent: string): string {
  const last = text(page.at(-1), "id");
  if (last === undefined || last === sent) {
    throw new PaperclipClientError(
      "Paperclip GET listComments answered the same page again.",
      "bad-answer",
    );
  }
  return last;
}
