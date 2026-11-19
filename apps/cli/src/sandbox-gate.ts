// The sandbox check before `halonic run` and `runs send` start
// anything (cli-output 3.4 and 3.8). It runs only when the workflow, or a
// workflow it starts, has an agent whose harness starts a program on this
// computer. An agent a person set to "On this computer" gets one ! line
// instead; any other such agent needs the sandbox, and when the sandbox
// can't start, nothing starts, nothing is written to the run log, and the
// command ends with exit 9. There is no flag that skips this (Julian, HAL-1673).

import { startsAProgram, workflowAgentsOf } from "@halonicjs/adapter-workspace-models";
import type { PlacementReader, RunDetail } from "@halonicjs/app";
import type { Sandbox } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { LoadedFileOf, LoadedWorkspace } from "@halonicjs/workspace";
import { dayInWords, localDay } from "./messages/dates.ts";
import type { Message } from "./messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { sandboxDocsLink, sandboxMessages, windowsNodeInWsl } from "./messages/sandbox.ts";

/** What the sandbox check reads on this computer, so tests can hand it fakes. */
export interface SandboxGateMachine {
  /** The sandbox the agents run in. Only its check is called. */
  readonly sandbox: Pick<Sandbox, "check">;
  /** Where each agent runs, as the person chose on this computer. */
  readonly placement: PlacementReader;
  /** The workspace's resolved real path, as placement choices are keyed. */
  readonly location: string;
  /** The raw bytes of a workspace file, by its workspace-relative path. */
  readFile(path: string): Promise<Uint8Array>;
  /**
   * Whether Windows' Node.js runs Halonic with the workspace in a WSL
   * folder: then a refusal says so, whatever the sandbox's own reason
   * (HAL-6517). Left out, it doesn't.
   */
  readonly windowsNodeInWsl?: boolean;
  /** The WSL distro the CLI runs in, from `WSL_DISTRO_NAME`, for the WSL 1 fix's command. */
  readonly wslDistro?: string | undefined;
}

/** An agent set to "On this computer": `halonic run` prints one ! line for it before the run. */
export interface UnsandboxedAgent {
  /** The agent's name, such as "Writer". */
  readonly name: string;
  /** When the person chose, as ISO text. */
  readonly chosenAt: string;
}

/**
 * A run refused because the sandbox can't start on this computer: line 1
 * says so and that nothing ran (or was sent), line 2 is the reason and fix
 * for its code, with a hint after it when the command has another way out,
 * line 3 the docs link and the code. The check's own sentence is only in
 * `cause`, so it shows with `--debug` and nowhere else.
 */
export class SandboxRefusedError extends KindedError {
  /** The `Sandbox` port's reason code, such as `bubblewrap-missing`, shown after the docs link. */
  readonly code: string;
  /** The sandbox page of the docs, for the code's section. */
  readonly docs: string;
  readonly #ending: Message;
  readonly #missing: readonly string[];
  readonly #wslDistro: string | undefined;

  constructor(
    code: string,
    ending: Message,
    missing: readonly string[],
    wslDistro?: string,
    hint?: Message,
  ) {
    const fix = plainText(sandboxMessages.refusedFix(code, { distro: wslDistro, missing }).phrase);
    super(
      "unavailable",
      `${plainText(sandboxMessages.cantStart().phrase)} ${plainText(ending.phrase)}`,
      {
        fix: hint === undefined ? fix : `${fix} ${plainText(hint.phrase)}`,
        ...(missing.length === 0 ? {} : { cause: new Error(missing.join(" ")) }),
      },
    );
    this.code = code;
    this.docs = sandboxDocsLink(code);
    this.#ending = ending;
    this.#missing = missing;
    this.#wslDistro = wslDistro;
  }

  /**
   * The same refusal with `hint` after the fix on line 2, for a command that
   * has another way out, such as `run`'s `--harness halonic` (HAL-12597).
   */
  withHint(hint: Message): SandboxRefusedError {
    return new SandboxRefusedError(this.code, this.#ending, this.#missing, this.#wslDistro, hint);
  }
}

/** The run the sandbox is checked for. */
export interface SandboxGateRun {
  readonly hubId: string;
  readonly workflowId: string;
  /**
   * The harness the run names for all its agents, which takes the place of
   * each agent's own, as the engine runs them (HAL-189). Left out, each
   * agent runs in its own.
   */
  readonly harness?: string;
}

/**
 * A stored run as the sandbox check needs it, for `runs send`: its hub and
 * workflow, and the harness it named for all its agents when it started
 * (HAL-4305), so the steps after the event are checked in the harness they
 * will run in.
 */
export function sandboxRunOf(detail: RunDetail): SandboxGateRun {
  const { hubId, workflowId } = detail.summary;
  const started = detail.events.find((each) => each.type === "run.started");
  const harness = started?.type === "run.started" ? started.harness : undefined;
  return harness === undefined ? { hubId, workflowId } : { hubId, workflowId, harness };
}

/**
 * The agents of the hub's workflow, and of every workflow it starts, whose
 * harness starts a program (Claude Code or Codex, not Halonic's own). Each
 * once, in the order the workflow first names them. The run's harness, when
 * it names one, is every agent's harness.
 *
 * @example
 * programAgentsOf(workspace, { hubId: "support", workflowId: "support-reply" }); // [agent file of "writer"]
 */
export function programAgentsOf(
  workspace: LoadedWorkspace,
  run: SandboxGateRun,
): LoadedFileOf<"agent">[] {
  return workflowAgentsOf(workspace, run).filter((agent) =>
    startsAProgram(run.harness ?? agent.value.harness),
  );
}

/**
 * Checks the sandbox before a run of the hub's workflow, when one of its
 * agents needs it.
 *
 * @param ending - what line 1 ends with: `runMessages.nothingRan()` for `run`,
 *   `sandboxMessages.nothingSent()` for `runs send`
 * @returns the agents set to "On this computer", for their ! lines
 * @throws SandboxRefusedError when an agent needs the sandbox and it can't start here (exit 9)
 */
export async function checkRunSandbox(
  workspace: LoadedWorkspace,
  run: SandboxGateRun,
  machine: SandboxGateMachine,
  ending: Message = runMessages.nothingRan(),
): Promise<UnsandboxedAgent[]> {
  const unsandboxed: UnsandboxedAgent[] = [];
  let needsSandbox = false;
  for (const agent of programAgentsOf(workspace, run)) {
    const answer = await machine.placement.where({
      location: machine.location,
      agent: agent.value.id,
      file: await machine.readFile(agent.path),
    });
    if (answer.runsOn === "this-computer") {
      unsandboxed.push({ name: agent.value.name, chosenAt: answer.chosenAt });
    } else {
      needsSandbox = true;
    }
  }
  if (needsSandbox) {
    const check = await machine.sandbox.check();
    if (!check.ok) {
      const code = machine.windowsNodeInWsl === true ? windowsNodeInWsl : check.reason;
      throw new SandboxRefusedError(code, ending, check.missing, machine.wslDistro);
    }
  }
  return unsandboxed;
}

/**
 * "Writer runs on this computer without the sandbox, as chosen on 9 Nov.",
 * with the day in the computer's own time zone.
 */
export function unsandboxedLine(agent: UnsandboxedAgent): Message {
  return runMessages.onThisComputer(agent.name, dayInWords(localDay(new Date(agent.chosenAt))));
}

/** "! Writer runs on this computer without the sandbox, as chosen on 9 Nov.": the line before the run starts. */
export function unsandboxedWarning(agent: UnsandboxedAgent): Phrase {
  return phrase`${markPart("needsYou")} ${unsandboxedLine(agent).phrase}`;
}
