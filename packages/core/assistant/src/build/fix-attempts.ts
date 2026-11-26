// The Build chat's count of failed fixes (`assistant.build.fix-attempts`,
// HAL-18391 plan section 2.4). A fix attempt is one accepted change set to
// the folder of the local integration the chat is about. It fails when the
// integration's next call fails, with any kind of trouble, so a fix that
// turns a 404 into a changed reply still counts. A 401 or a 429 isn't a code
// problem, so it never counts. After two failed attempts the chat stops
// changing that folder and reading its log: code stops the loop, not the
// prompt.
//
// This is a loop guard for the model, not a security boundary: a person who
// starts a new chat starts at zero, and that's fine. The count is kept with
// the chat, outside the workspace, so no workspace file can reset it.

import type { RequestLogLine, ReviewStep } from "@halonicjs/app";
import type { SavedFixAttempts } from "@halonicjs/ports";

/** How many failed fixes stop the chat. */
export const failedFixesAllowed = 2;

/**
 * What the chat answers once it stopped: the line the person reads, in the assistant's words
 * (Chief, HAL-19173), and what the model does with it.
 */
export const fixStopTexts = {
  line: (integration: string) =>
    `I've tried two fixes and the \`${integration}\` integration still fails, so I'll stop here instead of rewriting it again. You can change the code yourself, or start a new chat to try another way.`,
  result: (integration: string) =>
    `Stopped: two fixes to "${integration}" were followed by a failed call, so this chat changes nothing more in its folder and doesn't read its log. Tell the person exactly this, and nothing else about a next fix:\n${fixStopTexts.line(integration)}`,
};

/** A local integration, as a chat about it knows it. */
export interface LocalIntegration {
  /** Its id, as its permission sheet names it. */
  readonly id: string;
  /** Its folder, as a workspace path, such as `integrations/notes`. */
  readonly folder: string;
}

/** Where the host keeps one chat's fix attempts: with the chat, never in the workspace. */
export interface KeptFixAttempts {
  read(): Promise<SavedFixAttempts | undefined>;
  write(fixes: SavedFixAttempts): Promise<void>;
}

/** What the host gives the count, for one chat. */
export interface FixAttemptsOptions {
  /** The chat the count belongs to: only an Accept of its own cards counts. */
  readonly chatId: string;
  readonly kept: KeptFixAttempts;
  /** The local integration the chat is about, or `undefined`; read when a fix is accepted. */
  readonly integration: () => Promise<LocalIntegration | undefined>;
  /** The integration's local request log, oldest first. */
  readonly lines: (integration: string) => Promise<readonly RequestLogLine[]>;
  readonly now: () => Date;
}

/**
 * One chat's fix attempts. The host calls {@link reviewed} after every Accept, and the Build
 * chat's tools ask {@link stopped} before they change the folder or read its log.
 *
 * @example
 * const fixes = new FixAttempts({ chatId: "c1", kept, integration, lines, now });
 * const outcome = await review.accept(target);
 * if (outcome.status === "done") await fixes.reviewed(outcome.step);
 */
export class FixAttempts {
  readonly #options: FixAttemptsOptions;

  constructor(options: FixAttemptsOptions) {
    this.#options = options;
  }

  /**
   * Counts an Accept that took a change set of this chat to the integration's folder as a new
   * fix attempt, pending until the integration's next call. The attempt before it is settled first.
   * Any other step, a Reject or an Undo included, counts nothing.
   */
  async reviewed(step: ReviewStep): Promise<void> {
    const fixes = (await this.#settled()) ?? (await this.#none());
    if (fixes === undefined || !isAcceptedChangeSet(step, this.#options.chatId, fixes.folder)) {
      return;
    }
    await this.#options.kept.write({ ...fixes, pendingSince: this.#options.now().toISOString() });
  }

  /** The chat's fix attempts, with a pending one settled by the log when a call came. */
  async count(): Promise<SavedFixAttempts | undefined> {
    return this.#settled();
  }

  /**
   * The stop result, when two fixes failed and `path` is in the integration's folder; `undefined`
   * otherwise. Without a path, as for `read_request_log`, only the count matters.
   */
  async stopped(path?: string): Promise<string | undefined> {
    const fixes = await this.#settled();
    if (fixes === undefined || fixes.failed < failedFixesAllowed) return undefined;
    if (path !== undefined && !isInFolder(path, fixes.folder)) return undefined;
    return fixStopTexts.result(fixes.integration);
  }

  /**
   * Settles a pending attempt once a call after it failed with a code problem. A call that works
   * leaves no failure note, so the attempt stays pending until a failure or the next fix.
   */
  async #settled(): Promise<SavedFixAttempts | undefined> {
    const fixes = await this.#options.kept.read();
    if (fixes?.pendingSince === undefined) return fixes;
    const lines = await this.#options.lines(fixes.integration);
    if (firstCodeFailureAfter(lines, fixes.pendingSince) === undefined) return fixes;
    const { integration, folder, failed } = fixes;
    const settled = { integration, folder, failed: failed + 1 };
    await this.#options.kept.write(settled);
    return settled;
  }

  /** No fix accepted yet: the integration the chat is about, at zero. */
  async #none(): Promise<SavedFixAttempts | undefined> {
    const integration = await this.#options.integration();
    if (integration === undefined) return undefined;
    return { integration: integration.id, folder: integration.folder, failed: 0 };
  }
}

/**
 * Whether `step` is an Accept of one of the chat's cards that covers a file in `folder`. An Accept
 * changes only records, so its files have no `file`; a Reject or an Undo writes files back.
 */
export function isAcceptedChangeSet(step: ReviewStep, chatId: string, folder: string): boolean {
  return step.files.some(
    (each) =>
      each.file === undefined &&
      each.record.before?.card.chatId === chatId &&
      isInFolder(each.path, folder),
  );
}

/**
 * The first failed call after `since` that is a code problem. A failure is a sign-in (401) or
 * rate (429) problem when its kind says so, or when the newest request before it got that status.
 */
export function firstCodeFailureAfter(
  lines: readonly RequestLogLine[],
  since: string,
): RequestLogLine | undefined {
  let lastStatus: unknown;
  for (const line of lines) {
    if (line.type === "request") {
      lastStatus = line.status;
    } else if (line.at > since && !isNotCode(line.kind, lastStatus)) {
      return line;
    } else {
      lastStatus = undefined;
    }
  }
  return undefined;
}

/** Statuses and error kinds that say the call needs a new sign-in or a wait, not new code. */
const notCodeStatuses: ReadonlySet<unknown> = new Set([401, 429]);
const notCodeKinds: ReadonlySet<unknown> = new Set(["unauthenticated", "limit_reached"]);

function isNotCode(kind: unknown, status: unknown): boolean {
  return notCodeKinds.has(kind) || notCodeStatuses.has(status);
}

/** Whether `path` is the folder or inside it. Stored paths are canonical, so case alone is folded. */
function isInFolder(path: string, folder: string): boolean {
  const inside = path.toLowerCase();
  const top = folder.toLowerCase();
  return inside === top || inside.startsWith(`${top}/`);
}
