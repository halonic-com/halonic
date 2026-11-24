import type { InboxItem, MessagingProject } from "@halonicjs/ports";
import { approvalToItem, cardToItem } from "./cards.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import { type MapContext, newestFirst } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";

/** Task states whose cards may still wait on the person. A closed task's cards can't be answered. */
export const openTaskStates = "backlog,todo,in_progress,in_review,blocked";

/** Paperclip's largest page of tasks. */
const taskPage = "1000";

/** How many card reads run at once, so a first read of a big company doesn't flood the server. */
const cardReadsAtOnce = 4;

/** One task's cards, as read when the task last changed. */
interface TaskCards {
  updatedAt: string;
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
async function eachLimited<T>(
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
  #cards = new Map<string, TaskCards>();

  constructor(reader: PaperclipReader, company: string) {
    this.#reader = reader;
    this.#company = company;
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

  /** Every inbox item, newest first, each with its task's project when the task has one. */
  async list(context: MapContext): Promise<InboxItem[]> {
    const projectOf = await this.#projects(context);
    const approvals = await this.#approvals(context, projectOf);
    const cards = await this.#allCards(context, projectOf);
    return newestFirst([...approvals, ...cards], (item) => item.createdAt);
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
    const body = await this.#reader.read("listApprovals", {
      path: { company: this.#company },
      query: { status: "pending" },
    });
    const items: InboxItem[] = [];
    for (const record of asRecords(body)) {
      const approval = text(record, "id");
      if (approval === undefined) {
        continue;
      }
      const tasks = asRecords(await this.#reader.read("listApprovalTasks", { path: { approval } }));
      const task = text(tasks[0], "id");
      const item = approvalToItem(
        context,
        record,
        task === undefined ? undefined : context.ids.make("task", task),
      );
      if (item !== undefined) {
        // An approval with no task has no project.
        items.push(withProject(item, projectOf(text(tasks[0], "projectId"))));
      }
    }
    return items;
  }

  async #allCards(context: MapContext, projectOf: ProjectOf): Promise<InboxItem[]> {
    const tasks = await this.openTasks();
    const next = new Map<string, TaskCards>();
    const changed: { id: string; updatedAt: string; projectId: string | undefined }[] = [];
    for (const task of tasks) {
      const id = text(task, "id");
      const updatedAt = text(task, "updatedAt") ?? "";
      const projectId = text(task, "projectId");
      if (id === undefined) {
        continue;
      }
      const known = this.#cards.get(id);
      if (known !== undefined && known.updatedAt === updatedAt) {
        next.set(id, { ...known, projectId });
      } else {
        changed.push({ id, updatedAt, projectId });
      }
    }
    await eachLimited(changed, cardReadsAtOnce, async ({ id, updatedAt, projectId }) => {
      const records = await this.cardsOf(id);
      const items = records.flatMap((record) => cardToItem(context, id, record) ?? []);
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
