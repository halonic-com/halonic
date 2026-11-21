// `halonic run` at a terminal, when the run's check refused instructions
// nobody trusted (HAL-13062, the board's C on HAL-10522): it shows the files
// the check saw and their fingerprint, asks, and on yes trusts exactly that
// pin and starts the run again. Without a terminal (`CI`, `--json`, a
// routine or `serve`) it asks nothing, and the run stays refused with the
// lines that name `halonic trust instructions`.

import { realpath } from "node:fs/promises";
import { FileInstructionTrustStore } from "@halonicjs/adapter-fs-node";
import { InstructionTrustService } from "@halonicjs/app";
import type { LoggedInstructionPin, RunEvent } from "@halonicjs/events";
import { instructionTrustKey } from "@halonicjs/ports";
import { profileFolder } from "@halonicjs/profile";
import { filesOf } from "@halonicjs/workspace";
import { instructionsAbout } from "../../agent-instructions.ts";
import type { CommandContext, CommandInput, CommandResult, StoppedResult } from "../../command.ts";
import { instructionTrustFolder } from "../../local-harness-host.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { trustInstructionsMessages as words } from "../../messages/trust-instructions.ts";
import {
  type InstructionsAbout,
  instructionTrustLines,
} from "../../output/instruction-trust-lines.ts";
import { printable } from "../../output/printable.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { type FollowedResult, followWorkflow, type RunSetup } from "./run.ts";

/**
 * Runs the workflow, and when its check refused instructions nobody trusted
 * and a person is at the terminal, asks to trust them and runs it again. A
 * No, or nobody to ask, gives the refused run's own result.
 *
 * @throws what {@link followWorkflow} throws
 */
export async function runWorkflow(
  input: CommandInput,
  context: CommandContext,
  setup: RunSetup,
): Promise<CommandResult | StoppedResult> {
  // The refused run's lines are printed already, so the result after a yes starts with them too.
  const printed: Phrase[] = [];
  const recording: CommandContext = {
    ...context,
    printAhead: (line) => {
      printed.push(line);
      context.printAhead(line);
    },
  };
  const first = await followWorkflow(input, recording, setup);
  if ("stopped" in first) return first;
  const refused = refusedInstructions(first.run.events);
  if (refused === undefined || !(await trustedOnAsking(context, setup, first, refused))) {
    return first.result;
  }
  const trusted = phrase`${markPart("done")} ${words.trustedRunAgain(printable(refused.agent)).phrase}`;
  const between = [phrase``, trusted];
  for (const line of between) context.printAhead(line);
  const again = await followWorkflow(input, context, setup);
  if ("stopped" in again) return again;
  return { ...again.result, lines: [...printed, ...between, ...again.result.lines] };
}

/** The agent the check refused and the pin it saw, as the run log records them. */
interface RefusedInstructions {
  readonly agent: string;
  readonly pin: LoggedInstructionPin;
}

/**
 * The refusal the run ended with, from its `run.failed`, or from the last
 * branch whose `agent.finished` gave it when a parallel branch was refused;
 * `undefined` for any other run, or a log from before the pin was logged.
 */
function refusedInstructions(events: readonly RunEvent[]): RefusedInstructions | undefined {
  const failed = events.findLast((event) => event.type === "run.failed");
  if (failed?.type !== "run.failed" || failed.reason !== "instructions-not-trusted") {
    return undefined;
  }
  if (failed.agent !== undefined && failed.pin !== undefined) {
    return { agent: failed.agent, pin: failed.pin };
  }
  const branch = events.findLast(
    (event) => event.type === "agent.finished" && event.reason === "instructions-not-trusted",
  );
  return branch?.type === "agent.finished" && branch.pin !== undefined
    ? { agent: branch.agent, pin: branch.pin }
    : undefined;
}

/** Nobody can answer: the run stays refused, so this never reaches the person. */
class NobodyToAsk extends Error {}

/**
 * Shows what the check saw and asks; on yes, trusts exactly the pin the check
 * refused, never the files as they are now, which may differ from what the
 * run read. A person's answer is the only way here to `trust`.
 *
 * @returns whether the instructions are trusted now
 */
async function trustedOnAsking(
  context: CommandContext,
  setup: RunSetup,
  followed: FollowedResult,
  refused: RefusedInstructions,
): Promise<boolean> {
  const service = new InstructionTrustService({
    store: new FileInstructionTrustStore(
      instructionTrustFolder(profileFolder(setup.profile ?? nodeProfileEnvironment())),
    ),
    clock: setup.trust().clock,
  });
  // The refused agent runs in the workflow's hub, as the engine's check keyed it.
  const location = await realpath(followed.workspaceRoot);
  const key = instructionTrustKey(location, followed.hubId, refused.agent);
  const check = await service.check(key, refused.pin);
  // Trusted since the run was refused, say in another window: run it again without asking.
  if (check.kind === "trusted") return true;
  const agent = printable(refused.agent);
  try {
    const yes = await context.ask({
      question: words.question(agent),
      shownFirst: [
        phrase``,
        ...instructionTrustLines(agent, check, refused.pin, aboutRefused(followed, refused)),
      ],
      yes: false,
      refusal: () => new NobodyToAsk(),
    });
    if (!yes) return false;
  } catch (error) {
    if (error instanceof NobodyToAsk) return false;
    throw error;
  }
  await service.trust(key, refused.pin);
  return true;
}

/**
 * Where the refused agent's files are, from its file in the workflow's hub.
 * A file gone since the run started leaves the rows with the pin's own names.
 */
function aboutRefused(followed: FollowedResult, refused: RefusedInstructions): InstructionsAbout {
  const file = filesOf(followed.workspace, "agent").find(
    (agent) => agent.value.id === refused.agent && agent.hub === followed.hubId,
  );
  if (file !== undefined) return instructionsAbout(followed.workspace, file);
  return {
    harness: undefined,
    sourceOf: (name) => ({ label: phrase`${printable(name)}`, path: undefined }),
  };
}
