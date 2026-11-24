import type {
  PaperclipAgent,
  PaperclipAnswerResult,
  PaperclipAuthor,
  PaperclipCard,
  PaperclipCardAnswer,
  PaperclipComment,
  PaperclipCommentResult,
  PaperclipItemId,
  PaperclipProject,
  PaperclipRead,
  PaperclipSource,
  PaperclipTask,
} from "@halonicjs/ports";

/** Where a {@link FakePaperclipSource} is and what its clock says. */
export interface FakePaperclipSourceOptions {
  /** The connection's name. Defaults to "acme". */
  connection?: string;
  /** The company. Defaults to "acme-co". */
  company?: string;
  /** The time the fake stamps on reads and writes. Defaults to 24 Nov 2026, 10:00 UTC. */
  now?: () => Date;
}

/** Who the fake's own writes come from. */
const board: PaperclipAuthor = { kind: "board", name: "Board" };

/**
 * A {@link PaperclipSource} that lives in the process, so Studio's Inbox and
 * Messenger can be built and tested before the Paperclip client exists
 * (requirement `contracts.fake-paperclip-source`).
 *
 * A test fills it with `addAgent`, `addProject`, `addTask`, `addComment` and
 * `addCard`, plays another client with `answerElsewhere`, and cuts the line
 * with `goOffline`. Offline, reads give what was there when the line was cut,
 * and writes are refused with `offline`, never queued.
 *
 * @example
 * const source = new FakePaperclipSource();
 * const task = source.addTask({ key: "ACME-10", title: "Chat with Chief" });
 * const card = source.addCard({ task: task.ref, question: "Ship it?" });
 * await source.answerCard(card.ref, { kind: "option", option: "yes" });
 */
export class FakePaperclipSource implements PaperclipSource {
  readonly connection: string;
  readonly company: string;
  private readonly now: () => Date;
  private readonly agents: PaperclipAgent[] = [];
  private readonly projects: PaperclipProject[] = [];
  private readonly tasks: PaperclipTask[] = [];
  private readonly comments: PaperclipComment[] = [];
  private readonly cards: PaperclipCard[] = [];
  private made = 0;
  private lastRead: string;
  private offlineView: FakePaperclipSource | undefined;

  constructor(options: FakePaperclipSourceOptions = {}) {
    this.connection = options.connection ?? "acme";
    this.company = options.company ?? "acme-co";
    this.now = options.now ?? (() => new Date("2026-11-24T10:00:00.000Z"));
    this.lastRead = this.stamp();
  }

  listAgents(): Promise<PaperclipRead<PaperclipAgent>> {
    return this.read((source) => source.agents);
  }

  listProjects(): Promise<PaperclipRead<PaperclipProject>> {
    return this.read((source) => source.projects);
  }

  listTasks(): Promise<PaperclipRead<PaperclipTask>> {
    return this.read((source) =>
      [...source.tasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  listComments(task: PaperclipItemId): Promise<PaperclipRead<PaperclipComment>> {
    return this.read((source) => source.comments.filter((comment) => sameItem(comment.task, task)));
  }

  listCards(): Promise<PaperclipRead<PaperclipCard>> {
    return this.read((source) => [...source.cards].reverse());
  }

  answerCard(card: PaperclipItemId, answer: PaperclipCardAnswer): Promise<PaperclipAnswerResult> {
    if (this.offline) return Promise.resolve({ outcome: "refused", reason: "offline" });
    const found = this.cards.find((each) => sameItem(each.ref, card));
    if (found === undefined) return Promise.resolve({ outcome: "refused", reason: "not-found" });
    if (found.state.kind === "answered") {
      const { by, answeredAt } = found.state;
      return Promise.resolve({ outcome: "already-answered", by, answeredAt });
    }
    const answeredAt = this.stamp();
    found.state = { kind: "answered", by: board, answer, answeredAt };
    return Promise.resolve({ outcome: "answered", answeredAt });
  }

  commentOnChat(task: PaperclipItemId, body: string): Promise<PaperclipCommentResult> {
    if (this.offline) return Promise.resolve({ outcome: "refused", reason: "offline" });
    const found = this.tasks.find((each) => sameItem(each.ref, task));
    if (found === undefined) return Promise.resolve({ outcome: "refused", reason: "not-found" });
    if (found.chatWith === undefined) {
      return Promise.resolve({ outcome: "refused", reason: "not-a-chat" });
    }
    const comment = this.addComment({ task: found.ref, author: board, body });
    return Promise.resolve({ outcome: "sent", comment });
  }

  /** Whether the line to Paperclip is cut. */
  get offline(): boolean {
    return this.offlineView !== undefined;
  }

  /** Cuts the line: reads give what was there now, as of the last read, and writes are refused. */
  goOffline(): void {
    const view = new FakePaperclipSource({ connection: this.connection, company: this.company });
    view.agents.push(...copy(this.agents));
    view.projects.push(...copy(this.projects));
    view.tasks.push(...copy(this.tasks));
    view.comments.push(...copy(this.comments));
    view.cards.push(...copy(this.cards));
    this.offlineView = view;
  }

  /** Restores the line: reads are live again. */
  goOnline(): void {
    this.offlineView = undefined;
  }

  /** Adds an agent, idle unless told otherwise. */
  addAgent(agent: Partial<Omit<PaperclipAgent, "ref">> & { name: string }): PaperclipAgent {
    const added: PaperclipAgent = { ref: this.ref(), status: "idle", ...agent };
    this.agents.push(added);
    return added;
  }

  /** Adds a project. */
  addProject(project: { name: string }): PaperclipProject {
    const added: PaperclipProject = { ref: this.ref(), ...project };
    this.projects.push(added);
    return added;
  }

  /** Adds a task, `todo` and changed now unless told otherwise. */
  addTask(
    task: Partial<Omit<PaperclipTask, "ref">> & { key: string; title: string },
  ): PaperclipTask {
    const added: PaperclipTask = {
      ref: this.ref(),
      status: "todo",
      updatedAt: this.stamp(),
      ...task,
    };
    this.tasks.push(added);
    return added;
  }

  /** Adds a comment, from the board and written now unless told otherwise. */
  addComment(
    comment: Partial<Omit<PaperclipComment, "ref">> & { task: PaperclipItemId; body: string },
  ): PaperclipComment {
    const added: PaperclipComment = {
      ref: this.ref(),
      author: board,
      createdAt: this.stamp(),
      ...comment,
    };
    this.comments.push(added);
    return added;
  }

  /** Adds an open card with the options Yes and No unless told otherwise. */
  addCard(
    card: Partial<Omit<PaperclipCard, "ref">> & { task: PaperclipItemId; question: string },
  ): PaperclipCard {
    const added: PaperclipCard = {
      ref: this.ref(),
      from: { kind: "agent", agent: this.ref(), name: "Chief" },
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
      createdAt: this.stamp(),
      state: { kind: "open" },
      ...card,
    };
    this.cards.push(added);
    return added;
  }

  /** Another client, such as Paperclip's own page, answers a card first. */
  answerElsewhere(card: PaperclipItemId, by: PaperclipAuthor, answer: PaperclipCardAnswer): void {
    const found = this.cards.find((each) => sameItem(each.ref, card));
    if (found === undefined) throw new Error(`no card has the id ${card.id}`);
    found.state = { kind: "answered", by, answer, answeredAt: this.stamp() };
  }

  private read<Item>(
    pick: (source: FakePaperclipSource) => readonly Item[],
  ): Promise<PaperclipRead<Item>> {
    if (this.offlineView !== undefined) {
      const items = copy(pick(this.offlineView));
      return Promise.resolve({ items, asOf: this.lastRead, offline: true });
    }
    this.lastRead = this.stamp();
    return Promise.resolve({
      items: copy(pick(this)),
      asOf: this.lastRead,
      offline: false,
    });
  }

  private ref(): PaperclipItemId {
    this.made += 1;
    return { connection: this.connection, company: this.company, id: `item-${this.made}` };
  }

  private stamp(): string {
    return this.now().toISOString();
  }
}

/** Whether two IDs name the same item: same connection, company and Paperclip ID. */
function sameItem(left: PaperclipItemId, right: PaperclipItemId): boolean {
  return (
    left.connection === right.connection && left.company === right.company && left.id === right.id
  );
}

/** A deep copy of plain data, so a test can't change the fake's items through what a read gave. */
function copy<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
