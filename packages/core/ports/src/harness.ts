import type { AgentResume, RunEventBody, RunEventType } from "@halonicjs/events";
import type { SandboxProfile, SandboxSession } from "./sandbox.ts";

/** Version of the {@link Harness} port. A breaking change bumps it and comes with an ADR. */
export const harnessVersion = 2;

/**
 * Whether a harness can run on this machine, as `detect()` finds it. Studio
 * turns it into the sentence next to the harness choice, so each case
 * carries what that sentence needs.
 *
 * @example
 * const found = await codex.detect();
 * if (found.status === "missing") show(`${codex.name} isn't installed`);
 * if (found.status === "unsupported") {
 *   const oldest = found.supported.replace(/^>=/, "");
 *   show(`${codex.name} ${found.version} isn't supported. Halonic needs ${oldest} or newer.`);
 * }
 * if (found.status === "signed-out") show(`Found ${codex.name} ${found.version} · not signed in`);
 */
export type HarnessDetection =
  /** Installed in a version Halonic supports, and signed in, or its sign-in can't be checked. */
  | { status: "ready"; version: string }
  /**
   * Installed in a version Halonic supports, but the program says no one is
   * signed in on this computer. It can still run when Halonic holds a key
   * for the agent's model provider, so this isn't an error on its own.
   */
  | { status: "signed-out"; version: string }
  /** The program isn't installed, or isn't where Halonic looks for it. */
  | { status: "missing" }
  /**
   * Installed, but in a version Halonic doesn't support. `supported` names the
   * oldest version it does, always written as ">=X.Y.Z" (such as ">=1.0.0"),
   * so screens can drop the ">=" and say "needs 1.0.0 or newer".
   */
  | { status: "unsupported"; version: string; supported: string }
  /** Found, but asking it for its version failed; `error` says how, in words a person can act on. */
  | { status: "failed"; error: string };

/** What a harness run is asked to do: one agent of one run, with the agent's own settings. */
export interface HarnessTask {
  /** The run this agent belongs to. Every event the harness reports is written to its log. */
  runId: string;
  hubId: string;
  /** The agent's id; the harness sets it as `agent` on the events it reports for this agent. */
  agentId: string;
  /** The agent's instructions from its file; empty when it has none. */
  instructions: string;
  /** What the agent is asked to do in this run: the task step's prompt, or the chat message. */
  prompt: string;
  /** The model the agent's file names; the harness's own default when absent. */
  model?: string;
}

/**
 * The request header that carries the run's bridge token. The token has a
 * header of its own because `Authorization` isn't free: with a subscription,
 * it carries the person's own sign-in, which the bridge passes on unread.
 * Never put the token in the URL, because paths end up in logs.
 */
export const harnessBridgeTokenHeader = "x-halonic-run-token";

/**
 * The Halonic bridge of one run: a loopback address in Halonic that serves
 * the model gateway and Halonic's tools over MCP. The harness points its
 * program at `url` and has it send `token` in the
 * {@link harnessBridgeTokenHeader} header on every request.
 *
 * The token is a credential for this run only. A harness never writes it into
 * an event, a log line or an error message.
 */
export interface HarnessBridge {
  /** The bridge's address on loopback, such as "http://127.0.0.1:41817". */
  url: string;
  /** The run's random token. */
  token: string;
}

/** The body of the run log event with this `type`. */
type RunEventOf<Type extends RunEventType> = Extract<RunEventBody, { type: Type }>;

/**
 * What a harness reports, as run log events without the fields the engine
 * adds. A harness run is still a Halonic run: Runs, the receipt, budgets and
 * the inbox read these events as they read the built-in agent loop's, so a
 * harness has no event types of its own.
 *
 * The engine adds the run fields (`runId`, `seq`, `at`) and the workflow
 * `state` the agent runs in, then writes the event to the run's log.
 *
 * - `agent.started` and `agent.finished` with a `parent` report a subagent.
 *   The engine writes the task's own `agent.started` before it calls
 *   `start`; the stream ends with the task's own `agent.finished`, without a
 *   `parent`, whose `output` is the agent's result.
 * - `llm.request`, `llm.response` and `llm.fallback` report model calls, with
 *   their token use and cost.
 * - `knowledge.searched`, `tool.called` and `tool.result` report tool use.
 * - `approval.requested` asks a person for an OK; the harness waits until
 *   `send` brings the answer. The built-in loop sets `resume`, so the run can
 *   continue after a restart; a program can't be resumed, so a program
 *   harness leaves it out.
 *
 * `approval.resolved` isn't here: the engine writes it when a person answers,
 * and passes the answer on with `send`.
 *
 * Each model call and tool call is recorded once. A call that goes through
 * the Halonic bridge is recorded by the bridge, so a harness reports only the
 * calls its program makes elsewhere. The built-in loop calls the model port
 * and Halonic's tools directly, so it reports all of its own.
 */
export type HarnessEvent =
  | Omit<RunEventOf<"agent.started">, "state">
  | RunEventOf<"llm.request">
  | RunEventOf<"llm.response">
  | RunEventOf<"llm.fallback">
  | RunEventOf<"knowledge.searched">
  | RunEventOf<"tool.called">
  | RunEventOf<"tool.result">
  | (Omit<RunEventOf<"approval.requested">, "state" | "resume"> & { resume?: AgentResume })
  | Omit<RunEventOf<"agent.finished">, "state">;

/** What `send` passes to a running harness. */
export type HarnessInput =
  /** A person's answer to a question the agent asked, or the next message of a chat. */
  | { type: "answer"; text: string }
  /** A person's decision on the `approval.requested` event with this `callId`. */
  | { type: "approval"; callId: string; approved: boolean; comment?: string };

/**
 * One harness run: its events, read with `for await`, and the way to answer
 * it or stop it.
 *
 * The stream ends with the task agent's `agent.finished` and yields nothing
 * after it. A run that fails or is cancelled ends the stream with an error
 * instead. An error never contains the bridge token.
 */
export interface HarnessRun extends AsyncIterable<HarnessEvent> {
  /**
   * Passes a person's answer or approval decision to the run.
   *
   * @throws when the run has ended, or no `approval.requested` with that `callId` is waiting
   */
  send(input: HarnessInput): Promise<void>;
  /** Stops the run. Resolves once every program it started has stopped; does nothing on a run that has ended. */
  cancel(): Promise<void>;
}

/**
 * What drives an agent: Halonic's own agent loop, Claude Code or Codex. An
 * agent's file picks one by `id`.
 *
 * Every harness runs behind Halonic's `Sandbox` port and reaches Halonic
 * only through the bridge, so integrations, secrets and approvals stay in
 * Halonic. The built-in loop starts no program for the agent: it calls the
 * model port and Halonic's tools directly, ignores `bridge`, and uses
 * `session` only to start the stdio connectors a workspace names. On a
 * target that can't start programs, such as a cloud worker, the session's
 * `start` throws, so the same loop runs there without stdio connectors.
 *
 * @example
 * if ((await harness.detect()).status !== "ready") return;
 * const extra = harness.environment?.(bridge, profile) ?? {};
 * const session = await sandbox.open({ ...profile, env: addHarnessEnvironment(profile.env, extra) });
 * const run = harness.start(task, session, bridge);
 * for await (const event of run) {
 *   if (event.type === "approval.requested") await run.send(await askPerson(event));
 *   else record(event);
 * }
 */
export interface Harness {
  /** The value of `harness` in an agent's file, such as "claude-code". */
  readonly id: string;
  /** The name a person reads, such as "Claude Code". */
  readonly name: string;
  /**
   * Finds the harness's program on this machine, checks its version and,
   * where the program can tell, whether someone is signed in to it. Never
   * throws: a problem is a {@link HarnessDetection}.
   */
  detect(): Promise<HarnessDetection>;
  /**
   * The environment variables the harness's program needs, such as the
   * bridge's address, the token header and the program's own settings and
   * temp folders (requirement `ports.harness-environment`). The engine calls
   * it before it opens the sandbox and adds the result to the profile's `env`
   * with {@link addHarnessEnvironment}, so `session.profile` stays exactly
   * what the program gets.
   *
   * Optional: the built-in loop starts no program, so it has none.
   */
  environment?(
    bridge: HarnessBridge,
    folders: Pick<SandboxProfile, "workingFolder" | "tempFolder" | "settingsFolder">,
  ): Record<string, string>;
  /**
   * Starts the agent on `task` inside the sandbox `session`, pointed at the
   * run's `bridge`. Returns at once; a program that can't start ends the
   * stream with an error.
   */
  start(task: HarnessTask, session: SandboxSession, bridge: HarnessBridge): HarnessRun;
  /**
   * How a person signs in to the harness's program for one agent, with the
   * program's own sign-in (requirement `ports.harness-sign-in`). Studio runs
   * it in a terminal the person can see, and `halonic doctor` shows it.
   *
   * Optional: the built-in loop has no sign-in of its own.
   */
  readonly signIn?: HarnessSignIn;
}

/**
 * The program's own sign-in, pointed at one agent's settings folder. Each
 * agent signs in on its own, so a run reaches only its own sign-in; the
 * person's own is never copied there.
 *
 * @example
 * // Claude Code: CLAUDE_CONFIG_DIR=<agent's folder> claude auth login
 * const { program, args, folderVariable } = harness.signIn;
 * start(program, args, { [folderVariable]: profile.settingsFolder });
 */
export interface HarnessSignIn {
  /** The program, by the name Halonic finds it under, such as "claude". */
  readonly program: string;
  /** What it is asked to sign in, such as `["auth", "login"]`. */
  readonly args: readonly string[];
  /**
   * The environment variable that points the program at the agent's
   * settings folder, such as "CLAUDE_CONFIG_DIR": the same one
   * `environment()` sets for a run.
   */
  readonly folderVariable: string;
}

/**
 * The profile's environment with a harness's variables added (requirement
 * `ports.harness-environment`). A harness may only add: a name the engine
 * already set is an error, so a harness can't quietly replace `PATH` or
 * `HOME`. Names are compared without regard to case, because Windows treats
 * `Path` and `PATH` as one variable. For the same reason a harness may not set
 * two names that differ only in case: which one wins would depend on the
 * platform.
 *
 * @throws Error naming the variables in question, never their values, which may hold the run token
 */
export function addHarnessEnvironment(
  engine: Readonly<Record<string, string>>,
  harness: Readonly<Record<string, string>>,
): Record<string, string> {
  const twice = namesSetTwice(Object.keys(harness));
  if (twice.length > 0) {
    throw new Error(
      `The harness sets environment variables that differ only in case: ${twice.join(", ")}`,
    );
  }
  const engineNames = new Set(Object.keys(engine).map((name) => name.toUpperCase()));
  const clashes = Object.keys(harness).filter((name) => engineNames.has(name.toUpperCase()));
  if (clashes.length > 0) {
    throw new Error(
      `The harness sets environment variables Halonic already sets: ${clashes.join(", ")}`,
    );
  }
  return { ...engine, ...harness };
}

/** The names that share their spelling, apart from case, with an earlier name. */
function namesSetTwice(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const name of names) {
    const key = name.toUpperCase();
    if (seen.has(key)) twice.push(name);
    else seen.add(key);
  }
  return twice;
}
