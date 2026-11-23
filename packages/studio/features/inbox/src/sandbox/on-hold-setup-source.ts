import type { InboxNotices, SandboxFixedNotice } from "../notices/inbox-notices.ts";
import type { InboxSetupSource, SetupEntry } from "../setup-source.ts";
import { onHoldInboxWords } from "./sandbox-words.ts";

/**
 * An agent whose On this computer choice is on hold, and that a routine started since: its file
 * changed after the choice, so that run ran in the sandbox (checklist 3.8).
 */
export interface HeldAgent {
  readonly hubId: string;
  readonly id: string;
  /** The agent's name, as its file says. */
  readonly name: string;
  /** ISO start time of the newest routine run that ran it in the sandbox. */
  readonly since: string;
}

/**
 * The held agents the Inbox's on-hold rows read. The app provides it for each open workspace,
 * from the agents host and the run history; without it the Inbox has no on-hold rows.
 */
export interface HeldAgents {
  /** Every held agent a routine started since its hold. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly HeldAgent[]>;
  /**
   * Calls `listener` whenever the list may have changed: a run started, a file changed or a Where
   * it runs choice was saved. Returns a function that stops the calls.
   */
  subscribe(listener: () => void): () => void;
}

/** The on-hold rows' source and the "fixed" notices they leave in Notices. */
export interface OnHoldSetup {
  readonly source: InboxSetupSource;
  readonly notices: InboxNotices;
}

/** The account of an agent's row: its hub and its id, never its name. */
export function heldAccount(agent: { readonly hubId: string; readonly id: string }): string {
  return `${agent.hubId}/${agent.id}`;
}

/**
 * The Inbox's setup source for agents on hold (checklist 3.8): one entry per held agent, "Confirm
 * again: *Writer* runs in the sandbox for now", with no routine count, since its routines still run,
 * in the sandbox. An agent that was listed and isn't held any more (someone confirmed again or set it
 * back to the sandbox) keeps one "fixed" entry, which isn't counted, until its item isn't open any
 * more (`release`); then it leaves one notice, as the sandbox row does (3.5). What was listed is kept
 * in memory only, so after a restart there is no Fixed row.
 *
 * @example
 * const { source, notices } = onHoldSetup(heldAgents);
 * inbox.addSetupSource(source);
 */
export function onHoldSetup(agents: HeldAgents, now: () => Date = () => new Date()): OnHoldSetup {
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  let held = new Map<string, HeldAgent>();
  const fixed = new Map<string, { readonly agent: HeldAgent; readonly at: string }>();
  const notices = noticeStore();

  const source: InboxSetupSource = {
    provider: "sandbox-on-hold",
    name: onHoldInboxWords.name,
    async list() {
      const listed = new Map((await agents.list()).map((agent) => [heldAccount(agent), agent]));
      for (const [account, agent] of held) {
        if (!listed.has(account)) fixed.set(account, { agent, at: now().toISOString() });
      }
      // On hold again before its Fixed row went: it needs you again.
      for (const account of listed.keys()) fixed.delete(account);
      held = listed;
      return [
        ...[...listed.values()].map((agent) => entry(agent, agent.since)),
        ...[...fixed.values()].map(({ agent, at }) => ({ ...entry(agent, at), fixed: true })),
      ];
    },
    subscribe(listener) {
      listeners.add(listener);
      const stop = agents.subscribe(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
    release(account) {
      const done = fixed.get(account);
      if (done === undefined) return;
      fixed.delete(account);
      notices.add({
        kind: "sandbox-fixed",
        key: `sandbox-fixed:on-hold:${account}:${done.at}`,
        at: done.at,
        title: onHoldInboxWords.notice(done.agent.name),
      });
      changed();
    },
  };

  return { source, notices: notices.notices };
}

/** The "fixed" notices the rows leave, kept in memory only, and the way to add one. */
function noticeStore(): {
  readonly notices: InboxNotices;
  readonly add: (notice: SandboxFixedNotice) => void;
} {
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  const kept = new Map<string, SandboxFixedNotice>();
  return {
    notices: {
      list: async () => [...kept.values()],
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dismiss(key) {
        if (kept.delete(key)) changed();
      },
    },
    add(notice) {
      kept.set(notice.key, notice);
      changed();
    },
  };
}

/** An agent's row, Fixed or not: the same title and line, so the row keeps its words and adds **Fixed**. */
function entry(agent: HeldAgent, changedAt: string): SetupEntry {
  return {
    account: heldAccount(agent),
    title: onHoldInboxWords.title(agent.name),
    progress: onHoldInboxWords.line(agent.name),
    changedAt,
  };
}
