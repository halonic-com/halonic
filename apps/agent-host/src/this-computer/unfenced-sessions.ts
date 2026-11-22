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

/**
 * What the host's gate let out for one session: the profile it built, the
 * agent it built it for, and the instructions folder the profile opens,
 * which the host made itself (`agent-host.unfenced-gate`).
 */
export interface VettedSession {
  readonly profile: SandboxProfile;
  readonly hubId: string;
  readonly agentId: string;
  /** The instructions folder the profile was built with, `null` for none. */
  readonly instructionsFolder: string | null;
}

/** Why a run may not start in a session without the sandbox, as the route answers it. */
export interface UnfencedStartRefusal {
  readonly code: "environment_not_host" | "task_not_host";
  readonly message: string;
}

const notVettedMessage =
  "The agent host didn't open this session for an agent set to On this computer, so it starts no program in it.";
const otherEnvironmentMessage =
  "The session's environment isn't the one the agent host gives this agent's program, so it doesn't start.";
const otherAgentMessage =
  "The run names another agent than the one the agent host opened this session for, so it doesn't start.";
const otherInstructionsMessage =
  "The run's instructions folder isn't the one the agent host built this session with, so it doesn't start.";

/**
 * The sessions the host opened without the sandbox, each with the profile
 * the host built for it, until the session closes (requirement
 * `agent-host.unfenced-start`). A program in such a
 * session runs with all the person's rights, so its start is checked
 * against what the host knows, never what the page sent:
 * {@link UnfencedSessions.startRefusal} lets it start only with exactly the
 * environment the host's own profile and the harness's own variables make
 * for the run's bridge and task. No variable the page picks, such as
 * `PATH`, `NODE_OPTIONS` or `LD_PRELOAD`, can reach the program. The page
 * also picks part of the program's command line: the instructions folder
 * becomes Claude Code's `--plugin-dir` (and Codex's skills folder), and a
 * plugin's hooks run without asking anyone. So the run must name the agent
 * the gate let out, and no instructions folder but the one the host built
 * the session's profile with.
 */
export class UnfencedSessions {
  readonly #sessions: SessionTable;
  readonly #vetted = new Map<string, VettedSession>();

  constructor(sessions: SessionTable) {
    this.#sessions = sessions;
  }

  /**
   * Keeps what the gate let out for the session `id`, until the session
   * closes. Only the host's own gate calls it, once the session opened.
   */
  add(id: string, vetted: VettedSession): void {
    this.#vetted.set(id, vetted);
    this.#sessions.onClosed(id, () => this.#vetted.delete(id));
  }

  /**
   * Why a run may not start in the session, or `undefined` when it may. A
   * fenced session isn't checked here: its fence holds whatever its
   * variables say. A session without a fence starts a program only when the
   * host opened it through the gate, only for the agent and instructions
   * folder the gate let out, and only with the host's environment.
   */
  startRefusal(start: UnfencedStart): UnfencedStartRefusal | undefined {
    const vetted = this.#vetted.get(start.sessionId);
    if (vetted === undefined) {
      return start.session.fence.state === "off"
        ? { code: "environment_not_host", message: notVettedMessage }
        : undefined;
    }
    const taskMessage = otherTaskMessage(vetted, start.task);
    if (taskMessage !== undefined) return { code: "task_not_host", message: taskMessage };
    return isHostEnvironment(vetted.profile, start)
      ? undefined
      : { code: "environment_not_host", message: otherEnvironmentMessage };
  }
}

/** Why the task isn't the one the gate let out, or `undefined` when it is. */
function otherTaskMessage(vetted: VettedSession, task: HarnessTask): string | undefined {
  if (task.hubId !== vetted.hubId || task.agentId !== vetted.agentId) return otherAgentMessage;
  // Leaving the folder out is fine: the program then gets no plugins at all.
  if (
    task.instructionsFolder !== undefined &&
    task.instructionsFolder !== vetted.instructionsFolder
  ) {
    return otherInstructionsMessage;
  }
  return undefined;
}

/** Whether the session's environment is exactly the built profile's plus the harness's own variables. */
function isHostEnvironment(built: SandboxProfile, start: UnfencedStart): boolean {
  let expected: Record<string, string>;
  try {
    const added = start.harness.environment?.(start.bridge, built, start.task) ?? {};
    expected = addHarnessEnvironment(built.env, added);
  } catch {
    return false;
  }
  return sameEntries(expected, start.session.profile.env);
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
