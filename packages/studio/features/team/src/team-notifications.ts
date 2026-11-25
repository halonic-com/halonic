import type { MessagingId, TeamStatus } from "@halonicjs/ports";
import type { AgentNotice, NoticeTarget, Notifier } from "@halonicjs/studio-services";
import type { TeamClock } from "./team-format.ts";
import { type TeamAlert, type TeamReading, teamAlerts, teamBaseline } from "./team-notices.ts";

/** What {@link watchTeamNotifications} needs besides the port and the notifier. */
export interface TeamNotificationsOptions {
  readonly clock: TeamClock;
  /** Opens the seat or the merge queue in Studio. It only shows it. */
  open(target: NoticeTarget): void;
  /** Hears a failed read or a notification the system refused; the watch goes on. */
  onError(error: unknown): void;
}

/** A running watch; `stop` ends it and resolves once it has. */
export interface TeamNotificationsWatch {
  /** Resolves once the first read is in: what it found shows nothing. */
  readonly ready: Promise<void>;
  stop(): Promise<void>;
}

/**
 * Shows a desktop notification for each change {@link teamAlerts} finds
 * between two reads of `TeamStatus` (requirement `team.notifications`), through
 * phase 1's `Notifier`, so a `QuietHoursNotifier` holds them for its summary.
 * What is there when the watch starts shows nothing.
 *
 * @example
 * const watch = watchTeamNotifications(team, quietNotifier, { clock, open, onError });
 * await watch.stop();
 */
export function watchTeamNotifications(
  team: TeamStatus,
  notifier: Notifier,
  options: TeamNotificationsOptions,
): TeamNotificationsWatch {
  // Listen before the first read, so a change between the two isn't missed.
  const changes = team.changes()[Symbol.asyncIterator]();
  // A reader's `return` need not settle a `next` already waiting, so stopping also ends the wait.
  let endWait: (end: IteratorResult<MessagingId>) => void = () => undefined;
  const stopped = new Promise<IteratorResult<MessagingId>>((resolve) => {
    endWait = resolve;
  });
  const next = () => Promise.race([changes.next(), stopped]);
  const first = readOrReport(team, options);
  const running = follow(team, next, first, notifier, options);
  return {
    ready: first.then(() => undefined),
    async stop() {
      endWait({ done: true, value: undefined });
      await changes.return?.();
      await running;
    },
  };
}

async function follow(
  team: TeamStatus,
  nextChange: () => Promise<IteratorResult<MessagingId>>,
  first: Promise<TeamReading | undefined>,
  notifier: Notifier,
  options: TeamNotificationsOptions,
): Promise<void> {
  let last = await first;
  for (let change = await nextChange(); change.done !== true; change = await nextChange()) {
    const next = await readOrReport(team, options);
    if (last === undefined || next === undefined) {
      last = next ?? last;
      continue;
    }
    await notifyChanges(last, next, notifier, options);
    last = teamBaseline(last, next);
  }
}

/** Shows what changed; a failure is reported, never left to end the watch. */
async function notifyChanges(
  last: TeamReading,
  next: TeamReading,
  notifier: Notifier,
  options: TeamNotificationsOptions,
): Promise<void> {
  let alerts: readonly TeamAlert[];
  try {
    alerts = teamAlerts(last, next, options.clock);
  } catch (error) {
    options.onError(error);
    return;
  }
  for (const alert of alerts) {
    const notice = toNotice(alert);
    try {
      await notifier.show(notice, () => options.open(notice.target));
    } catch (error) {
      options.onError(error);
    }
  }
}

async function readOrReport(
  team: TeamStatus,
  options: TeamNotificationsOptions,
): Promise<TeamReading | undefined> {
  try {
    const [seats, queues] = await Promise.all([team.seats(), team.mergeQueue()]);
    return { seats, queues };
  } catch (error) {
    options.onError(error);
    return undefined;
  }
}

function toNotice(alert: TeamAlert): AgentNotice {
  return {
    reason: alert.about.kind === "seat" ? "seat" : "queue",
    title: alert.title,
    body: alert.body,
    target: alert.about,
  };
}
