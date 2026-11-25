import type { InboxItem, MessagingProject } from "@halonicjs/ports";
import { approvalToItem, cardToItem } from "./cards.ts";
import { decisionPage, decisionToItem } from "./decisions.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import type { PaperclipSteppers } from "./steppers.ts";

/** Task states whose cards may still wait on the person. A closed task's cards can't be answered. */
export const openTaskStates = "backlog,todo,in_progress,in_review,blocked";

/**
 * Paperclip's largest page of tasks. The provider reads one page: a company
 * with more than 1000 open tasks loses the rest from work and the Inbox
 * without an error. Paging comes when a company gets near that.
 */
const taskPage = "1000";

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
  #cards = new Map<string, TaskCards>();
  /** Each pending approval's first linked task, read once: an approval's links don't change. */
  #approvalTasks = new Map<string, JsonRecord | undefined>();

  /** With `steppers`, a card that pins a stepper request is served as a stepper item. */
  constructor(reader: PaperclipReader, company: string, steppers?: PaperclipSteppers) {
    this.#reader = reader;
    this.#company = company;
    this.#steppers = steppers;
  }

  /** The company's open tasks. */
  async openTasks(): Promise<JsonRecord[]> {
    const body = await this.#reader.read("listTasks", {
      path: { company: this.#company },
      query: { status: openTaskStates, limit: taskPage },
    });
    return asRecords(body);
  }

  /** The cards on task `task`, as Paperclip has them now. */
  async cardsOf(task: string): Promise<JsonRecord[]> {
    return asRecords(await this.#reader.read("listTaskCards", { path: { task } }));
  }

  /**
   * Every inbox item, newest first, each with its task's project when the
   * task has one. `tasks` is the open-task list when the caller already
   * read it in this poll, so one poll reads it once.
   */
  async list(context: MapContext, tasks?: readonly JsonRecord[]): Promise<InboxItem[]> {
    const projectOf = await this.#projects(context);
    const approvals = await this.#approvals(context, projectOf);
    const decisions = await this.#decisions(context);
    const read = await this.#allCards(context, projectOf, tasks ?? (await this.openTasks()));
    const cards =
      this.#steppers === undefined
        ? read
        : await this.#steppers.refresh(read, (item) => context.ids.read(item.id, "card")?.[0]);
    return newestFirst([...approvals, ...decisions, ...cards], (item) => item.createdAt);
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

  async #approvals(context: MapContext, projectOf: ProjectOf): Promise<InboxItem[]> {
    const items: InboxItem[] = [];
    const known = new Map<string, JsonRecord | undefined>();
    for (const record of await this.#approvalRecords()) {
      const approval = text(record, "id");
      if (approval === undefined) {
        continue;
      }
      const linked = await this.#taskOfApproval(approval);
      known.set(approval, linked);
      const task = text(linked, "id");
      const item = approvalToItem(
        context,
        record,
        task === undefined ? undefined : context.ids.make("task", task),
      );
      if (item !== undefined) {
        // An approval with no task has no project.
        items.push(withProject(item, projectOf(text(linked, "projectId"))));
      }
    }
    // Decided approvals drop out, so the cache holds only open ones.
    this.#approvalTasks = known;
    return items;
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
  ): Promise<InboxItem[]> {
    const next = new Map<string, TaskCards>();
    const changed: { id: string; updatedAt: string | undefined; projectId: string | undefined }[] =
      [];
    for (const task of tasks) {
      const id = text(task, "id");
      const updatedAt = text(task, "updatedAt");
      const projectId = text(task, "projectId");
      if (id === undefined) {
        continue;
      }
      const known = this.#cards.get(id);
      if (known !== undefined && updatedAt !== undefined && known.updatedAt === updatedAt) {
        next.set(id, { ...known, projectId });
      } else {
        changed.push({ id, updatedAt, projectId });
      }
    }
    await eachLimited(changed, cardReadsAtOnce, async ({ id, updatedAt, projectId }) => {
      const items: InboxItem[] = [];
      for (const record of await this.cardsOf(id)) {
        const item = cardToItem(context, id, record);
        if (item !== undefined) {
          items.push(
            this.#steppers === undefined ? item : await this.#steppers.serve(id, record, item),
          );
        }
      }
      next.set(id, { updatedAt, projectId, items });
    });
    // Closed tasks drop out here, so their cards leave the Inbox with them.
    this.#cards = next;
    return [...next.values()].flatMap((entry) => {
      const project = projectOf(entry.projectId);
      return entry.items.map((item) => withProject(item, project));
    });
  }
}
