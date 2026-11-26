import type { Attachment, InboxItem, MessagingId, MessagingProject } from "@halonicjs/ports";
import { PaperclipBoardMentions } from "./board-mentions.ts";
import { PaperclipBoardRequests } from "./board-requests.ts";
import { assignedToPerson, boardTaskToItem } from "./board-tasks.ts";
import { cardFilesOf, type FilesOf, PaperclipCardFiles } from "./card-files.ts";
import { approvalToItem, cardToItem } from "./cards.ts";
import { mayBeChannel } from "./channels.ts";
import { decisionPage, decisionToItem } from "./decisions.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import type { PaperclipSteppers } from "./steppers.ts";
import { PaperclipTaskList } from "./task-list.ts";
import { companyPrefix, type PaperclipWebLinks, prefixOf, withWebLink } from "./web-links.ts";

/** Approval states the Inbox shows: waiting on the person, or on the agent after Request changes. */
const waitingApprovalStates = ["pending", "revision_requested"] as const;

/** How many card reads run at once, so a first read of a big company doesn't flood the server. */
const cardReadsAtOnce = 4;

/** One task's cards, as read when the task last changed. */
interface TaskCards {
  /** When the task last changed; without one, its cards are read again on every list. */
  updatedAt: string | undefined;
  /** The task's Paperclip project, if it has one; its name is looked up on every list. */
  projectId: string | undefined;
  /** The task's identifier, such as `ACME-7`, for its page in Paperclip. */
  identifier: string | undefined;
  items: readonly InboxItem[];
}

/** Looks up a Paperclip project ID in the projects read for this list. */
type ProjectOf = (projectId: string | undefined) => MessagingProject | undefined;

/** `item` with `project`, or as it is when there is none. */
function withProject(item: InboxItem, project: MessagingProject | undefined): InboxItem {
  return project === undefined ? item : { ...item, project };
}

/** Runs `work` on every item, at most `limit` at a time. */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) {
        await work(item);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/**
 * Reads every item that waits on the person across the whole company
 * (`inbox.every-waiting-item`): pending approvals, and the cards on every
 * open task, chat or not. Paperclip has no company-wide read for cards, so
 * it reads each open task's cards, but only again when the task changed:
 * Paperclip touches a task whenever a card on it is made or answered.
 */
export class PaperclipInbox {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #steppers: PaperclipSteppers | undefined;
  readonly #boardRequests: PaperclipBoardRequests;
  readonly #tasks: PaperclipTaskList;
  readonly #webLinks: PaperclipWebLinks;
  readonly #mentions: PaperclipBoardMentions;
  /** The files on cards and approvals, and the only ones `readAttachment` reads. */
  readonly files: PaperclipCardFiles;
  #cards = new Map<string, TaskCards>();
  /** Each pending approval's first linked task, read once: an approval's links don't change. */
  #approvalTasks = new Map<string, JsonRecord | undefined>();
  /** Each pending approval's files, read once: they are the files posted before it was made. */
  #approvalFiles = new Map<string, Attachment[]>();

  /**
   * `webLinks` gives cards and approvals their page in Paperclip. With `steppers`, a card that
   * pins a stepper request is served as a stepper item. The comments that mention the person
   * are items too; `connection.warn` hears when they can't be read.
   */
  constructor(
    reader: PaperclipReader,
    connection: { company: string; warn?: ((message: string) => void) | undefined },
    webLinks: PaperclipWebLinks,
    now: () => Date,
    steppers?: PaperclipSteppers,
  ) {
    const company = connection.company;
    this.#reader = reader;
    this.#company = company;
    this.#webLinks = webLinks;
    this.#steppers = steppers;
    this.#mentions = new PaperclipBoardMentions(reader, webLinks, connection, now);
    this.#boardRequests = new PaperclipBoardRequests(reader, company);
    // A channel's members line and a person's task's text are in the description, which the task
    // list's index view leaves out.
    const readWhole = (task: JsonRecord) => mayBeChannel(task) || assignedToPerson(task);
    this.#tasks = new PaperclipTaskList(reader, company, { readWhole });
    this.files = new PaperclipCardFiles(reader);
  }

  /** The company's open tasks, read as the changes since the last read (`paperclip-client.delta-reads`). */
  openTasks(): Promise<readonly JsonRecord[]> {
    return this.#tasks.read();
  }

  /** Paperclip's time of the newest task change the list applied; `undefined` before the first read. */
  tasksAsOf(): string | undefined {
    return this.#tasks.watermark().updatedAt;
  }

  /** The cards on task `task`, as Paperclip has them now. */
  async cardsOf(task: string): Promise<JsonRecord[]> {
    return asRecords(await this.#reader.read("listTaskCards", { path: { task } }));
  }

  /**
   * Every inbox item, newest first, each with its task's project when the
   * task has one, and the open tasks assigned to the person that wait on
   * nothing else. `tasks` is the open-task list when the caller already
   * read it in this poll, so one poll reads it once.
   */
  async list(context: MapContext, tasks?: readonly JsonRecord[]): Promise<InboxItem[]> {
    const projectOf = await this.#projects(context);
    const open = tasks ?? (await this.openTasks());
    // A task with both an approval and a card has its files read once.
    const filesOf = this.files.oncePerList();
    const approvals = await this.#approvals(context, projectOf, companyPrefix(open), filesOf);
    const decisions = await this.#decisions(context);
    const boardRequests = await this.#boardRequests.list(context);
    const mentions = await this.#mentions.list(context, open, projectOf);
    const read = await this.#allCards(context, projectOf, open, filesOf);
    const cards =
      this.#steppers === undefined
        ? read
        : await this.#steppers.refresh(read, (item) => context.ids.read(item.id, "card")?.[0]);
    const others = [...approvals, ...decisions, ...boardRequests, ...cards];
    const items = newestFirst(
      [...others, ...mentions, ...this.#boardTasks(context, projectOf, open, others)],
      (item) => item.createdAt,
    );
    this.files.remember(context.ids, items);
    return items;
  }

  /**
   * The open tasks assigned to the person. A task with a card or an approval that waits on them
   * shows as that item only, so nothing shows twice.
   */
  #boardTasks(
    context: MapContext,
    projectOf: ProjectOf,
    tasks: readonly JsonRecord[],
    others: readonly InboxItem[],
  ): InboxItem[] {
    const waiting = new Set<MessagingId>(
      others.flatMap((item) =>
        item.state.kind === "open" && item.work !== undefined ? [item.work] : [],
      ),
    );
    return tasks.flatMap((task) => {
      const webLink = this.#webLinks.task(text(task, "identifier"));
      const item = boardTaskToItem(context, task, webLink);
      return item === undefined || waiting.has(item.id)
        ? []
        : [withProject(item, projectOf(text(task, "projectId")))];
    });
  }

  /** The company's projects, read once per list, as a lookup. */
  async #projects(context: MapContext): Promise<ProjectOf> {
    const body = await this.#reader.read("listProjects", { path: { company: this.#company } });
    const names = new Map(
      asRecords(body).flatMap((record) => {
        const id = text(record, "id");
        const name = text(record, "name");
        return id === undefined || name === undefined ? [] : [[id, name] as const];
      }),
    );
    return (projectId) => {
      const name = projectId === undefined ? undefined : names.get(projectId);
      return projectId === undefined || name === undefined
        ? undefined
        : { id: context.ids.make("project", projectId), name };
    };
  }

  /** `prefix` is the company's task prefix, for the page of an approval linked to no task. */
  async #approvals(
    context: MapContext,
    projectOf: ProjectOf,
    prefix: string | undefined,
    filesOf: FilesOf,
  ): Promise<InboxItem[]> {
    const items: InboxItem[] = [];
    const known = new Map<string, JsonRecord | undefined>();
    const files = new Map<string, Attachment[]>();
    for (const record of await this.#approvalRecords()) {
      const approval = text(record, "id");
      if (approval === undefined) {
        continue;
      }
      const linked = await this.#taskOfApproval(approval);
      known.set(approval, linked);
      const task = text(linked, "id");
      const mapped = approvalToItem(
        context,
        record,
        task === undefined ? undefined : context.ids.make("task", task),
      );
      if (mapped !== undefined) {
        const attachments = await this.#approvalFilesOf(
          context,
          { approval, task, filesOf },
          mapped.createdAt,
        );
        files.set(approval, attachments);
        const item = { ...mapped, attachments };
        // An approval with no task has no project.
        const linkedPrefix = prefixOf(text(linked, "identifier")) ?? prefix;
        const webLink = this.#webLinks.approval(linkedPrefix, approval);
        items.push(withWebLink(withProject(item, projectOf(text(linked, "projectId"))), webLink));
      }
    }
    // Decided approvals drop out, so the cache holds only open ones.
    this.#approvalTasks = known;
    this.#approvalFiles = files;
    return items;
  }

  /** An approval's files, from its first linked task only; none without one. */
  async #approvalFilesOf(
    context: MapContext,
    { approval, task, filesOf }: { approval: string; task: string | undefined; filesOf: FilesOf },
    madeAt: string,
  ): Promise<Attachment[]> {
    const known = this.#approvalFiles.get(approval);
    if (known !== undefined) return known;
    if (task === undefined) return [];
    return cardFilesOf(context.ids, task, await filesOf(task), madeAt);
  }

  /**
   * Pending approvals, then those sent back with Request changes, which wait on the agent that
   * asked and show as answered. Each read keeps only its own status, whatever the server sends.
   */
  async #approvalRecords(): Promise<JsonRecord[]> {
    const records: JsonRecord[] = [];
    for (const status of waitingApprovalStates) {
      const body = await this.#reader.read("listApprovals", {
        path: { company: this.#company },
        query: { status },
      });
      records.push(...asRecords(body).filter((record) => text(record, "status") === status));
    }
    return records;
  }

  /** The open decisions, Paperclip's largest page of them. */
  async #decisions(context: MapContext): Promise<InboxItem[]> {
    const body = await this.#reader.read("listDecisions", {
      path: { company: this.#company },
      query: { status: "open", limit: decisionPage },
    });
    return asRecords(body).flatMap((record) => decisionToItem(context, record) ?? []);
  }

  async #taskOfApproval(approval: string): Promise<JsonRecord | undefined> {
    if (this.#approvalTasks.has(approval)) {
      return this.#approvalTasks.get(approval);
    }
    const tasks = asRecords(await this.#reader.read("listApprovalTasks", { path: { approval } }));
    return tasks[0];
  }

  async #allCards(
    context: MapContext,
    projectOf: ProjectOf,
    tasks: readonly JsonRecord[],
    filesOf: FilesOf,
  ): Promise<InboxItem[]> {
    const next = new Map<string, TaskCards>();
    const changed: (Omit<TaskCards, "items"> & { id: string })[] = [];
    for (const task of tasks) {
      const id = text(task, "id");
      const updatedAt = text(task, "updatedAt");
      const projectId = text(task, "projectId");
      const identifier = text(task, "identifier");
      if (id === undefined) {
        continue;
      }
      const known = this.#cards.get(id);
      if (known !== undefined && updatedAt !== undefined && known.updatedAt === updatedAt) {
        next.set(id, { ...known, projectId, identifier });
      } else {
        changed.push({ id, updatedAt, projectId, identifier });
      }
    }
    await eachLimited(changed, cardReadsAtOnce, async ({ id, ...task }) => {
      const items: InboxItem[] = [];
      const cards = (await this.cardsOf(id)).flatMap((record) => {
        const item = cardToItem(context, id, record);
        return item === undefined ? [] : [{ record, item }];
      });
      // A task's files are read only when it has a card for the person, once per change.
      const files = cards.length === 0 ? [] : await filesOf(id);
      for (const { record, item: read } of cards) {
        const item = { ...read, attachments: cardFilesOf(context.ids, id, files, read.createdAt) };
        items.push(
          this.#steppers === undefined ? item : await this.#steppers.serve(id, record, item),
        );
      }
      next.set(id, { ...task, items });
    });
    // Closed tasks drop out here, so their cards leave the Inbox with them.
    this.#cards = next;
    return [...next.values()].flatMap((entry) => {
      const project = projectOf(entry.projectId);
      const webLink = this.#webLinks.task(entry.identifier);
      return entry.items.map((item) => withWebLink(withProject(item, project), webLink));
    });
  }
}
