// The sandbox check before `halonic run` (and later `runs send`) starts
// anything (cli-output 3.4 and 3.8). It runs only when the workflow, or a
// workflow it starts, has an agent whose harness starts a program on this
// computer. An agent a person set to "On this computer" gets one ! line
// instead; any other such agent needs the sandbox, and when the sandbox
// can't start, nothing starts, nothing is written to the run log, and the
// command ends with exit 9. There is no flag that skips this (Julian, HAL-1673).

import type { PlacementReader } from "@halonicjs/app";
import type { Agent, Workflow } from "@halonicjs/format";
import type { Sandbox } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { dayInWords, localDay } from "./messages/dates.ts";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { sandboxDocsLink, sandboxMessages } from "./messages/sandbox.ts";

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
 * for its code, line 3 the docs link and the code. The check's own
 * sentence is only in `cause`, so it shows with `--debug` and nowhere else.
 */
export class SandboxRefusedError extends KindedError {
  /** The `Sandbox` port's reason code, such as `bubblewrap-missing`, shown after the docs link. */
  readonly code: string;
  /** The sandbox page of the docs, for the code's section. */
  readonly docs: string;

  constructor(code: string, ending: Message, missing: readonly string[]) {
    super(
      "unavailable",
      `${plainText(sandboxMessages.cantStart().phrase)} ${plainText(ending.phrase)}`,
      {
        fix: plainText(sandboxMessages.refusedFix(code).phrase),
        ...(missing.length === 0 ? {} : { cause: new Error(missing.join(" ")) }),
      },
    );
    this.code = code;
    this.docs = sandboxDocsLink(code);
  }
}

/**
 * The agents of the hub's workflow, and of every workflow it starts, whose
 * harness starts a program (Claude Code or Codex, not Halonic's own). Each
 * once, in the order the workflow first names them.
 *
 * @example
 * programAgentsOf(workspace, "support", "support-reply"); // [agent file of "writer"]
 */
export function programAgentsOf(
  workspace: LoadedWorkspace,
  hubId: string,
  workflowId: string,
): LoadedFileOf<"agent">[] {
  const workflows = firstById(filesOf(workspace, "workflow"), hubId);
  const agents = firstById(filesOf(workspace, "agent"), hubId);
  const found = new Map<string, LoadedFileOf<"agent">>();
  const seen = new Set<string>();
  const visit = (id: string): void => {
    const workflow = workflows.get(id)?.value;
    if (workflow === undefined || seen.has(id)) return;
    seen.add(id);
    for (const name of namedIn(workflow)) {
      if (name.kind === "workflow") {
        visit(name.id);
        continue;
      }
      const agent = agents.get(name.id);
      if (agent !== undefined && startsAProgram(agent.value)) found.set(name.id, agent);
    }
  };
  visit(workflowId);
  return [...found.values()];
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
  hubId: string,
  workflowId: string,
  machine: SandboxGateMachine,
  ending: Message = runMessages.nothingRan(),
): Promise<UnsandboxedAgent[]> {
  const unsandboxed: UnsandboxedAgent[] = [];
  let needsSandbox = false;
  for (const agent of programAgentsOf(workspace, hubId, workflowId)) {
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
    if (!check.ok) throw new SandboxRefusedError(check.reason, ending, check.missing);
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

/**
 * The hub's files of one kind by id. A duplicate id is an error the loader
 * reports; the first by path wins, as in `definitionsOf`.
 */
function firstById<File extends LoadedFileOf<"workflow" | "agent">>(
  files: readonly File[],
  hubId: string,
): Map<string, File> {
  const byId = new Map<string, File>();
  for (const file of files) {
    if (file.hub === hubId && !byId.has(file.value.id)) byId.set(file.value.id, file);
  }
  return byId;
}

/** Whether the agent's harness starts a program on this computer. */
function startsAProgram(agent: Agent): boolean {
  return agent.harness !== undefined && agent.harness !== "halonic";
}

/** An agent or a workflow a workflow's states name. */
type Named = { readonly kind: "agent" | "workflow"; readonly id: string };

/** Every agent and workflow the states of a workflow name, in the order they appear. */
function namedIn(workflow: Workflow): Named[] {
  const names: Named[] = [];
  for (const state of Object.values(workflow.states)) {
    if (state.agent !== undefined) names.push({ kind: "agent", id: state.agent });
    if (state.workflow !== undefined) names.push({ kind: "workflow", id: state.workflow });
    for (const branch of Object.values(state.branches ?? {})) {
      names.push({ kind: "agent", id: branch.agent });
    }
  }
  return names;
}
