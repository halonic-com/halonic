import {
  addHarnessEnvironment,
  type Harness,
  type HarnessBridge,
  type HarnessTask,
  type SandboxProfile,
  type SandboxSession,
} from "@halonicjs/ports";
import type { SessionTable } from "../sandbox/session-table.ts";

/** What a run's start in a session without the sandbox is checked with. */
export interface UnfencedStart {
  readonly sessionId: string;
  readonly session: SandboxSession;
  readonly harness: Harness;
  readonly task: HarnessTask;
  /** The host's own bridge the run starts on, with the providers it serves with a key. */
  readonly bridge: HarnessBridge;
}

const notVettedMessage =
  "The agent host didn't open this session for an agent set to On this computer, so it starts no program in it.";
const otherEnvironmentMessage =
  "The session's environment isn't the one the agent host gives this agent's program, so it doesn't start.";

/**
 * The sessions the host opened without the sandbox, each with the profile
 * the host built for it, until the session closes (requirement
 * `agent-host.unfenced-start`). A program in such a
 * session runs with all the person's rights, so its start is checked
 * against what the host knows, never what the page sent:
 * {@link UnfencedSessions.startRefusal} lets it start only with exactly the
 * environment the host's own profile and the harness's own variables make
 * for the run's bridge and task. No variable the page picks, such as
 * `PATH`, `NODE_OPTIONS` or `LD_PRELOAD`, can reach the program.
 */
export class UnfencedSessions {
  readonly #sessions: SessionTable;
  readonly #built = new Map<string, SandboxProfile>();

  constructor(sessions: SessionTable) {
    this.#sessions = sessions;
  }

  /**
   * Keeps the profile the host built for the session `id`, until the session
   * closes. Only the host's own gate calls it, once the session opened.
   */
  add(id: string, built: SandboxProfile): void {
    this.#built.set(id, built);
    this.#sessions.onClosed(id, () => this.#built.delete(id));
  }

  /**
   * Why a run may not start in the session, or `undefined` when it may. A
   * fenced session isn't checked here: its fence holds whatever its
   * variables say. A session without a fence starts a program only when the
   * host opened it through the gate, and only with the host's environment.
   */
  startRefusal(start: UnfencedStart): string | undefined {
    const built = this.#built.get(start.sessionId);
    if (built === undefined) {
      return start.session.fence.state === "off" ? notVettedMessage : undefined;
    }
    let expected: Record<string, string>;
    try {
      const added = start.harness.environment?.(start.bridge, built, start.task) ?? {};
      expected = addHarnessEnvironment(built.env, added);
    } catch {
      return otherEnvironmentMessage;
    }
    return sameEntries(expected, start.session.profile.env) ? undefined : otherEnvironmentMessage;
  }
}

/** Whether the two hold the same names with the same values, in any order. */
function sameEntries(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const names = Object.keys(left);
  return (
    names.length === Object.keys(right).length &&
    names.every((name) => Object.hasOwn(right, name) && right[name] === left[name])
  );
}
