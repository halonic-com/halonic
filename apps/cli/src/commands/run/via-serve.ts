// `halonic run` while `halonic serve` holds the workspace's engine (`cli.local-engine-lock`,
// HAL-19396): one engine per workspace stays the rule, so `run` asks `serve` to start the run on
// its engine, over the console channel `serve pair` uses. The run then shows in the phone's Inbox.
// Any other holder, or a `serve` whose console can't be reached, keeps the lock's refusal.

import { EngineLockHeldError } from "@halonicjs/adapter-workspace-engine-node";
import { shortRunId } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import { ConsoleNoReplyError } from "@halonicjs/target-node-runtime";
import { type CommandInput, type CommandResult, OwnLineError } from "../../command.ts";
import { engineHolders } from "../../engine-lock.ts";
import { exitCode } from "../../exit-code.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { runViaServeMessages } from "../../messages/run-via-serve.ts";
import { printable } from "../../output/printable.ts";
import type { SandboxGateRun } from "../../sandbox-gate.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import { askServe, consolePlace, type ServeAnswer } from "../serve/serve-console.ts";
import type { RunSetup } from "./run.ts";

/** The run `run` would have started itself, as `serve` is asked to start it. */
export interface RunForServe {
  readonly workflow: SandboxGateRun;
  readonly input: Record<string, unknown>;
  /** The options `run` was given: those only a run it follows itself can take keep the refusal. */
  readonly options: CommandInput["options"];
  /** The user's own `--dir`, for the suggested command. */
  readonly typedDir: string | undefined;
  /**
   * The lines `run` gives before a run it starts itself, such as saved changes that aren't live
   * (`cli.run-live-version`) or an agent without the sandbox (`cli.sandbox-gate`): a run `serve`
   * starts reads the same version, so they hold for it too. Worked out only for a run `serve`
   * starts, before it starts, so an agent the sandbox refuses starts nothing.
   */
  warnings(): Promise<readonly Phrase[]>;
}

/** A run `serve` started: `run` follows nothing, and its result says where the run went. */
export interface HandedToServe {
  readonly handedToServe: CommandResult;
}

/** Options that need `run` to follow the run in this terminal, which a run in `serve` can't. */
const followedHereOnly = ["event", "harness", "follow"] as const;

/**
 * The most bytes one console request may have, its line end not counted, as the console socket
 * reads it (`runtime.console-socket`); a longer one is dropped without an answer.
 */
export const consoleRequestLimit = 4096;

/**
 * Has the running `serve` start the run when `refusal`, from opening the engine, says `serve`
 * holds its lock, and gives the lines that say so: exit 0 with the run's id.
 *
 * @throws refusal itself when another command holds the lock, the run takes an option only a run
 *   followed here can (`--event`, `--harness`, `--follow`), `serve`'s console can't be reached,
 *   or that `serve` doesn't know the request
 * @throws OwnLineError `conflict` when the input is too big to hand over; nothing ran
 * @throws OwnLineError `conflict` when `serve` refused the start, `unavailable` when it failed to
 *   start it; nothing ran
 * @throws OwnLineError `unavailable` when `serve` took the start but didn't answer in time; the
 *   run may have started
 */
export async function startInServe(
  refusal: unknown,
  setup: RunSetup,
  dir: OpenWorkspaceDir,
  run: RunForServe,
): Promise<CommandResult> {
  const followedHere = followedHereOnly.some((name) => {
    const value = run.options[name];
    return value !== undefined && value !== false;
  });
  if (!heldByServe(refusal) || followedHere) throw refusal;
  const warnings = await run.warnings();
  const answer = await askToStart(setup, dir, run).catch((error: unknown) => {
    // `serve` took the start and may have started the run: the refusal's fix would run it twice.
    if (error instanceof KindedError && error.cause instanceof ConsoleNoReplyError) {
      throw new OwnLineError(
        "unavailable",
        runViaServeMessages.noAnswer(),
        runViaServeMessages.noAnswerFix(run.typedDir),
      );
    }
    // No console to reach, as on Windows: the lock's refusal says what to do.
    if (error instanceof KindedError && !(error instanceof OwnLineError)) throw refusal;
    throw error;
  });
  const runId = answer["runId"];
  if (answer.ok && typeof runId === "string") {
    const shown = shortRunId(runId);
    return {
      exitCode: exitCode.ok,
      lines: [
        ...warnings,
        runViaServeMessages.started(shown).phrase,
        runViaServeMessages.seeIt(shown, run.typedDir).phrase,
      ],
      json: { run: { id: runId }, startedBy: engineHolders.serve.command },
    };
  }
  // A `serve` from before this request answers it as a request it doesn't know.
  if (answer["reason"] === "bad-request") throw refusal;
  throw notStarted(answer);
}

/** Whether the lock `refusal` names is held by `serve`. */
function heldByServe(refusal: unknown): boolean {
  const cause = refusal instanceof KindedError ? refusal.cause : undefined;
  return (
    cause instanceof EngineLockHeldError && cause.holder?.holder === engineHolders.serve.command
  );
}

/**
 * Sends the start to `serve`.
 *
 * @throws OwnLineError `conflict` when the request is longer than the console takes
 */
async function askToStart(
  setup: RunSetup,
  dir: OpenWorkspaceDir,
  run: RunForServe,
): Promise<ServeAnswer> {
  const { hubId, workflowId } = run.workflow;
  const request = { op: "start-run", hubId, workflowId, input: run.input };
  // Without the line end, as the socket reads it.
  const bytes = new TextEncoder().encode(JSON.stringify(request)).length;
  if (bytes > consoleRequestLimit) {
    throw new OwnLineError(
      "conflict",
      runViaServeMessages.inputTooBig(consoleRequestLimit / 1024),
      runViaServeMessages.inputTooBigFix(),
    );
  }
  return await askServe(setup, await consolePlace(setup, dir), request);
}

/**
 * Why `serve` didn't start the run: its refusal in its own sentence, which only ever comes from
 * Halonic's own checks; any other failure is only in `serve`'s `--debug` lines.
 */
function notStarted(answer: ServeAnswer): OwnLineError {
  const message = answer["message"];
  if (answer["reason"] === "not-found") {
    return new OwnLineError("conflict", runViaServeMessages.notInServe());
  }
  if (typeof message === "string") {
    return new OwnLineError("conflict", runViaServeMessages.notStarted(printable(message)));
  }
  // Not `internal`: its generic line points at this command's `--debug`, and the cause is in serve's.
  return new OwnLineError(
    "unavailable",
    runViaServeMessages.startFailed(),
    runViaServeMessages.startFailedFix(),
  );
}
