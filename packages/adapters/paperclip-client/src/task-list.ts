import { asRecord, asRecords, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { bodyOf, type PaperclipAnswer, PaperclipClientError } from "./transport.ts";

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
 * One read in this many loads the open tasks whole and replaces the list. A task that leaves
 * Paperclip's list without changing (deleted, hidden, or an external conversation waiting on the
 * other side) never comes back in a delta, so it leaves at that load.
 */
const readsPerFullLoad = 10;

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

/** How the task list reads. */
export interface TaskListOptions {
  /** Whether a task is read whole with `getTask`, because `view=index` leaves out its description. */
  readWhole?: (task: JsonRecord) => boolean;
  /** For tests; Paperclip's largest page by default. */
  pageSize?: number;
}

/** One read of the task list: a full load of the open tasks, or the changes since the watermark. */
interface Pass {
  /** `updatedSince` for a delta pass; none for a full load. */
  since: string | undefined;
  /** For a full load, the list it builds, which replaces the kept one when the pass ends. */
  loaded: Map<string, JsonRecord> | undefined;
  /** Whether the first page was read, which alone gives the pass its watermark. */
  started: boolean;
  /** The newest `updatedAt` on the pass's first page. */
  newest: string | undefined;
}

/** The later of two ISO times, by the instant they name. A time `Date.parse` can't read is skipped. */
function later(left: string | undefined, right: string | undefined): string | undefined {
  if (right === undefined || Number.isNaN(Date.parse(right))) {
    return left;
  }
  return left === undefined || Date.parse(right) > Date.parse(left) ? right : left;
}

/** Whether Paperclip refused the indexed read as a bad request, as releases before v2026.1117.0 do. */
function refusesIndex(answer: PaperclipAnswer): boolean {
  return answer.kind === "failed" && answer.failure === "refused" && answer.status === 400;
}

/**
 * The company's open tasks, kept in memory and read from Paperclip as deltas
 * (`paperclip-client.delta-reads`): a full load of the open tasks, then only
 * the tasks changed since the watermark, with no status filter, so a task that
 * closes leaves the list. Both read `view=index` and page by task ID. On a
 * Paperclip that refuses `view=index`, every read is one plain page instead.
 */
export class PaperclipTaskList {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #pageSize: number;
  readonly #readWhole: (task: JsonRecord) => boolean;
  #tasks = new Map<string, JsonRecord>();
  #watermark: TaskWatermark = { updatedAt: undefined, afterId: undefined };
  #pass: Pass | undefined;
  /** Delta reads since the last full load. */
  #deltas = 0;
  /** Whether Paperclip refused `view=index`, so every read is the plain one. */
  #plain = false;
  /** The read in flight, which a second caller joins instead of starting its own. */
  #reading: Promise<readonly JsonRecord[]> | undefined;

  constructor(reader: PaperclipReader, company: string, options: TaskListOptions = {}) {
    this.#reader = reader;
    this.#company = company;
    this.#pageSize = options.pageSize ?? largestPage;
    this.#readWhole = options.readWhole ?? (() => false);
  }

  /** Where the list stands, for the sync service that keeps it. */
  watermark(): TaskWatermark {
    return { ...this.#watermark };
  }

  /** The open tasks after reading what changed. A failed page throws and the next read resumes after it. */
  read(): Promise<readonly JsonRecord[]> {
    this.#reading ??= this.#readOnce().finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }

  async #readOnce(): Promise<readonly JsonRecord[]> {
    if (!this.#plain && (await this.#readPass())) {
      return [...this.#tasks.values()];
    }
    this.#plain = true;
    this.#pass = undefined;
    const body = await this.#reader.read("listTasks", {
      path: { company: this.#company },
      query: { status: openTaskStates, limit: String(largestPage) },
    });
    this.#tasks = new Map(asRecords(body).flatMap((task) => keyed(task)));
    return [...this.#tasks.values()];
  }

  /** Reads one pass to its end; `false` when Paperclip refuses the indexed read. */
  async #readPass(): Promise<boolean> {
    const pass = this.#pass ?? this.#startPass();
    for (;;) {
      const answer = await this.#page(pass);
      if (refusesIndex(answer)) {
        return false;
      }
      const page = asRecords(bodyOf("listTasks", answer));
      if (!pass.started) {
        // Pages go by ID, so a task on an earlier page can change while a later one is read:
        // only the first page's newest `updatedAt` is older than every change after it.
        pass.newest = page.reduce<string | undefined>(
          (newest, task) => later(newest, text(task, "updatedAt")),
          undefined,
        );
        pass.started = true;
      }
      for (const task of page) {
        await this.#apply(pass, task);
      }
      if (page.length < this.#pageSize) {
        break;
      }
      this.#watermark.afterId = nextAfterId(page, this.#watermark.afterId);
    }
    this.#finish(pass);
    return true;
  }

  #startPass(): Pass {
    const { updatedAt } = this.#watermark;
    const full = updatedAt === undefined || this.#deltas >= readsPerFullLoad - 1;
    const since = full ? undefined : new Date(Date.parse(updatedAt) - overlapMs).toISOString();
    const pass: Pass = {
      since,
      loaded: full ? new Map() : undefined,
      started: false,
      newest: undefined,
    };
    this.#pass = pass;
    return pass;
  }

  #finish(pass: Pass): void {
    if (pass.loaded === undefined) {
      this.#deltas += 1;
    } else {
      this.#tasks = pass.loaded;
      this.#deltas = 0;
    }
    this.#pass = undefined;
    this.#watermark = {
      updatedAt: later(this.#watermark.updatedAt, pass.newest),
      afterId: undefined,
    };
  }

  #page(pass: Pass): Promise<PaperclipAnswer> {
    const { afterId } = this.#watermark;
    return this.#reader.send("listTasks", {
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
  }

  /** Keeps an open task as read, replacing the copy kept before; drops a closed one. */
  async #apply(pass: Pass, task: JsonRecord): Promise<void> {
    const id = text(task, "id");
    if (id === undefined) {
      return;
    }
    const status = text(task, "status");
    const list = pass.loaded ?? this.#tasks;
    if (status === undefined || !openStates.has(status)) {
      list.delete(id);
      return;
    }
    list.set(id, await this.#whole(id, task));
  }

  /** `task` with its description when it must be read whole, read again only when it changed. */
  async #whole(id: string, task: JsonRecord): Promise<JsonRecord> {
    if (!this.#readWhole(task)) {
      return task;
    }
    const kept = this.#tasks.get(id);
    if (kept !== undefined && text(kept, "updatedAt") === text(task, "updatedAt")) {
      return kept;
    }
    return asRecord(await this.#reader.read("getTask", { path: { task: id } })) ?? task;
  }
}

/** `task` keyed by its ID, or nothing when it has none. */
function keyed(task: JsonRecord): [string, JsonRecord][] {
  const id = text(task, "id");
  return id === undefined ? [] : [[id, task]];
}

/** The last task ID on a full page, which the next page starts after; throws when paging can't move on. */
function nextAfterId(page: readonly JsonRecord[], sent: string | undefined): string {
  const last = text(page.at(-1), "id");
  if (last === undefined || last === sent) {
    throw new PaperclipClientError(
      "Paperclip GET listTasks answered the same page again.",
      "bad-answer",
    );
  }
  return last;
}
