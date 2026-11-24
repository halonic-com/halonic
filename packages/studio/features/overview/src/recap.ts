import type { InboxItem, MessagingId, WorkItem } from "@halonicjs/ports";

/** An inbox item that still waits, and how long it has. */
export interface RecapOpenItem {
  readonly id: MessagingId;
  /** Agent-written Markdown; the recap draws it as plain text. */
  readonly question: string;
  readonly waitingMs: number;
}

/** A piece of work as the recap shows it. */
export interface RecapWork {
  readonly id: MessagingId;
  readonly label: string;
  readonly title: string;
}

/** What changed since the last recap the person opened. */
export interface Recap {
  /** When the last recap was opened, or `undefined` for the first one. */
  readonly since: string | undefined;
  readonly answered: number;
  /** Open items, the one waiting longest first. */
  readonly open: readonly RecapOpenItem[];
  readonly done: readonly RecapWork[];
  readonly newlyBlocked: readonly RecapWork[];
  /** True when nothing was answered, finished or blocked since, and nothing is open. */
  readonly empty: boolean;
}

/** What {@link buildRecap} reads, as `AgentMessaging` gives it. */
export interface RecapInput {
  readonly items: readonly InboxItem[];
  readonly work: readonly WorkItem[];
  readonly since: string | undefined;
  readonly now: Date;
}

/**
 * Builds the daily recap (requirement `overview.daily-recap`) from
 * `AgentMessaging` reads only: items answered, items still open with how
 * long each has waited, work done and work newly blocked, each since the
 * last recap the person opened. With no earlier recap, everything counts.
 */
export function buildRecap(input: RecapInput): Recap {
  const after = (at: string) =>
    input.since === undefined || Date.parse(at) > Date.parse(input.since);
  const answered = input.items.filter(
    (item) => item.state.kind === "answered" && after(item.state.answeredAt),
  ).length;
  const open = input.items
    .filter((item) => item.state.kind === "open")
    .map((item) => ({
      id: item.id,
      question: item.question,
      waitingMs: Math.max(0, input.now.getTime() - Date.parse(item.createdAt)),
    }))
    .sort((a, b) => b.waitingMs - a.waitingMs);
  const changed = input.work.filter((item) => after(item.updatedAt));
  const done = changed.filter((item) => item.state === "done").map(recapWork);
  const newlyBlocked = changed.filter((item) => item.state === "blocked").map(recapWork);
  const empty =
    answered === 0 && open.length === 0 && done.length === 0 && newlyBlocked.length === 0;
  return { since: input.since, answered, open, done, newlyBlocked, empty };
}

function recapWork(item: WorkItem): RecapWork {
  return { id: item.id, label: item.label, title: item.title };
}
