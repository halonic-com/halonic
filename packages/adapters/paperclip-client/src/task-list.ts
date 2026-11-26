import { asRecords, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";

/** Task states whose cards may still wait on the person. A closed task's cards can't be answered. */
export const openTaskStates = "backlog,todo,in_progress,in_review,blocked";

const openStates: ReadonlySet<string> = new Set(openTaskStates.split(","));

/** Paperclip's largest page of tasks. */
const largestPage = 1000;

/**
 * How far before the watermark a delta read starts. Paperclip reads `updatedSince` as "strictly
 * after", and a task can commit with an `updatedAt` a little older than one already read.
 */
const overlapMs = 30_000;

/**
 * Where the task list stands: the newest server `updatedAt` it has applied, and, while a pass is
 * unfinished, the last task ID it read. Paperclip pages `afterId` in ID order only, so a page
 * boundary among tasks with equal `updatedAt` values resumes after that ID instead of reading the
 * same tasks again.
 */
export interface TaskWatermark {
  /** The newest `updatedAt` of a finished pass, from Paperclip, never from our clock. */
  updatedAt: string | undefined;
  /** The last task ID read in the pass that hasn't finished yet. */
  afterId: string | undefined;
}

/** One read of the task list: the first full load, or the changes since the watermark. */
interface Pass {
  /** `updatedSince` for a delta pass; none for the full load of open tasks. */
  since: string | undefined;
  /** The newest `updatedAt` read in this pass so far. */
  newest: string | undefined;
}

/** The later of two ISO times, by the instant they name. */
function later(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined || right === undefined) {
    return left ?? right;
  }
  return Date.parse(right) > Date.parse(left) ? right : left;
}

/**
 * The company's open tasks, kept in memory and read from Paperclip as deltas
 * (`paperclip-client.delta-reads`): one full load of the open tasks, then only
 * the tasks changed since the watermark, with no status filter, so a task that
 * closes leaves the list. Both read `view=index` and page by task ID.
 */
export class PaperclipTaskList {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #pageSize: number;
  readonly #tasks = new Map<string, JsonRecord>();
  #watermark: TaskWatermark = { updatedAt: undefined, afterId: undefined };
  #pass: Pass | undefined;
  /** The read in flight, which a second caller joins instead of starting its own. */
  #reading: Promise<readonly JsonRecord[]> | undefined;

  /** `pageSize` is for tests; Paperclip's largest page by default. */
  constructor(reader: PaperclipReader, company: string, pageSize = largestPage) {
    this.#reader = reader;
    this.#company = company;
    this.#pageSize = pageSize;
  }

  /** Where the list stands, for the sync service that keeps it. */
  watermark(): TaskWatermark {
    return { ...this.#watermark };
  }

  /** The open tasks after reading what changed. A failed page throws and the next read resumes after it. */
  read(): Promise<readonly JsonRecord[]> {
    this.#reading ??= this.#readPass().finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }

  async #readPass(): Promise<readonly JsonRecord[]> {
    const pass = this.#pass ?? this.#startPass();
    let full = false;
    while (!full) {
      const page = await this.#page(pass);
      for (const task of page) {
        this.#apply(task);
        pass.newest = later(pass.newest, text(task, "updatedAt"));
      }
      // Saved after every page, so a failed page doesn't make the next read start over.
      this.#watermark.afterId = text(page.at(-1), "id") ?? this.#watermark.afterId;
      full = page.length < this.#pageSize;
    }
    this.#pass = undefined;
    this.#watermark = {
      updatedAt: later(this.#watermark.updatedAt, pass.newest),
      afterId: undefined,
    };
    return [...this.#tasks.values()];
  }

  #startPass(): Pass {
    const { updatedAt } = this.#watermark;
    const since =
      updatedAt === undefined
        ? undefined
        : new Date(Date.parse(updatedAt) - overlapMs).toISOString();
    const pass: Pass = { since, newest: undefined };
    this.#pass = pass;
    return pass;
  }

  async #page(pass: Pass): Promise<JsonRecord[]> {
    const { afterId } = this.#watermark;
    const body = await this.#reader.read("listTasks", {
      path: { company: this.#company },
      query: {
        // The delta has no status filter: a task that closed must come back to leave the list.
        ...(pass.since === undefined ? { status: openTaskStates } : { updatedSince: pass.since }),
        view: "index",
        sortField: "id",
        sortDir: "asc",
        limit: String(this.#pageSize),
        ...(afterId === undefined ? {} : { afterId }),
      },
    });
    return asRecords(body);
  }

  /** Keeps an open task as read, replacing the copy kept before; drops a closed one. */
  #apply(task: JsonRecord): void {
    const id = text(task, "id");
    if (id === undefined) {
      return;
    }
    const status = text(task, "status");
    if (status === undefined || !openStates.has(status)) {
      this.#tasks.delete(id);
      return;
    }
    this.#tasks.set(id, task);
  }
}
