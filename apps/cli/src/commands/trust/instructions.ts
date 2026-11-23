import { realpath } from "node:fs/promises";
import { FileInstructionTrustStore } from "@halonicjs/adapter-fs-node";
import { InstructionTrustService } from "@halonicjs/app";
import {
  type Clock,
  type InstructionPin,
  type InstructionTrustStore,
  instructionTrustKey,
} from "@halonicjs/ports";
import { profileFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { instructionTrustFolder } from "@halonicjs/target-node-harness";
import {
  type AgentFile,
  agentNamed,
  instructionPathsOf,
  instructionsAbout,
  instructionsPinIn,
} from "../../agent-instructions.ts";
import {
  type CliCommand,
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { trustMessages } from "../../messages/trust.ts";
import { trustInstructionsMessages as words } from "../../messages/trust-instructions.ts";
import { NotTrustedError } from "../../not-trusted.ts";
import {
  type InstructionQuestion,
  type InstructionsAbout,
  instructionTrustLines,
  whyAsked,
} from "../../output/instruction-trust-lines.ts";
import { printable } from "../../output/printable.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import { dirOption, openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { type ReviewedFiles, reviewedFiles } from "./reviewed-version.ts";

/** What `trust instructions` keeps the trusted instructions in, so tests can hand it their own. */
export interface InstructionTrustMachine {
  /** The trusted pins in the user's profile, which a harness run's check reads too. */
  readonly store: InstructionTrustStore;
  readonly clock: Clock;
  /** Opens the workspace's history, for the version a run would start; git on the `PATH` when left out. */
  readonly history?: OpenWorkspaceHistory;
}

/**
 * The trusted pins in the profile folder (`HALONIC_HOME`, or the system's
 * data folder), where `halonic run`'s harness host reads them.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeInstructionTrustMachine(): InstructionTrustMachine {
  return {
    store: new FileInstructionTrustStore(
      instructionTrustFolder(profileFolder(nodeProfileEnvironment())),
    ),
    clock: systemClock,
  };
}

/**
 * `halonic trust instructions <agent> [--dir <folder>] [--yes --fingerprint
 * <fingerprint>]` (HAL-13062, the board's C on HAL-10522): shows the agent's
 * instruction files and their fingerprint, and saves them as trusted only on
 * a person's yes, or on `--yes` with the fingerprint of what they reviewed.
 * This command, run by a person, is the CLI's one way to trust instructions:
 * nothing a run or a model's tool reaches calls `InstructionTrustService.trust`.
 */
export function createTrustInstructionsCommand(machine: () => InstructionTrustMachine): CliCommand {
  return {
    name: "instructions",
    usage: "<agent> [--dir <folder>] [--yes --fingerprint <fingerprint>]",
    takesArguments: true,
    summary: words.summary(),
    action: (input) => words.action(typedAgent(input)),
    options: {
      dir: dirOption,
      yes: { type: "boolean", description: trustMessages.yesOption() },
      fingerprint: {
        type: "string",
        valueName: "fingerprint",
        description: trustMessages.fingerprintOption(),
      },
    },
    run: (input, context) => reviewAndTrust(machine(), input, context),
  };
}

/** `halonic trust instructions`, on the trusted pins in the user's profile. */
export const trustInstructionsCommand: CliCommand = createTrustInstructionsCommand(
  nodeInstructionTrustMachine,
);

/**
 * Pins the agent's instructions as a run would, from the version `halonic
 * run` would start (HAL-16386), and, unless they're trusted already, shows
 * them and asks. Before saving it reads that version and pins them again:
 * only what the person saw is trusted, never a file or a commit that changed
 * while they answered.
 *
 * @throws UsageError for no agent or several, or `--yes` without `--fingerprint`
 * @throws NotTrustedError when the fingerprint isn't the current one, or nobody can answer
 */
async function reviewAndTrust(
  machine: InstructionTrustMachine,
  input: CommandInput,
  context: CommandContext,
): Promise<CommandResult> {
  const { typed, agent, dir, fingerprint, yes } = trustOptions(input);
  const opened = await openWorkspaceDir(input, context);
  const history = machine.history ?? openGitHistory;
  const reviewed = await reviewedFiles(opened, history);
  const file = agentNamed(reviewed.workspace, typed);
  const facts = { agent: typed, folder: opened.shown };
  if (file.value.harness === undefined) {
    return done(words.ownLoop(agent).phrase, { ...facts, status: "not-needed" });
  }
  const location = await realpath(opened.root);
  const pin = await instructionsPinIn(reviewed, file);
  if (pin === null) {
    return done(words.noInstructions(agent).phrase, { ...facts, status: "not-needed" });
  }

  // The engine's check keys the pin by the agent's hub and id; this saves it under the same key.
  const key = instructionTrustKey(location, file.hub ?? "", file.value.id);
  const service = new InstructionTrustService({ store: machine.store, clock: machine.clock });
  const check = await service.check(key, pin);
  const notCommitted = notCommittedLine(reviewed, file, agent, dir);
  const about = { ...instructionsAbout(reviewed.workspace, file), notCommitted };
  const refusal = { agent, dir, pin, about };
  if (fingerprint !== undefined && fingerprint !== pin.digest) {
    throw fingerprintNotCurrent(refusal, check.kind === "ask" ? check : undefined);
  }
  if (check.kind === "trusted") {
    const json = { ...facts, status: "already-trusted", fingerprint: pin.digest };
    return done(words.alreadyTrusted(agent).phrase, json, notCommitted);
  }

  const lines = instructionTrustLines(agent, check, pin, about);
  const trusted = await context.ask({
    question: words.question(agent),
    shownFirst: lines,
    yes,
    refusal: () => noTerminal(refusal, check, lines),
  });
  if (!trusted) {
    return { exitCode: exitCode.notTrusted, lines: [words.notTrusted().phrase], json: {} };
  }
  // Read and pinned again: a file or commit that changed while the person answered isn't what they saw.
  const again = await reviewedFiles(opened, history);
  const answered = await instructionsPinIn(again, agentNamed(again.workspace, typed));
  if (answered?.digest !== pin.digest) {
    throw fingerprintNotCurrent({ ...refusal, pin: answered ?? pin }, undefined);
  }
  await service.trust(key, pin);
  return done(words.trusted(agent).phrase, {
    ...facts,
    status: "trusted",
    fingerprint: pin.digest,
  });
}

/** The command's words and options, read once. */
interface TrustOptions {
  /** The agent as typed, which finds its file. */
  readonly typed: string;
  /** The same, made safe to print. */
  readonly agent: string;
  readonly dir: string | undefined;
  readonly fingerprint: string | undefined;
  readonly yes: boolean;
}

/**
 * The agent and options, before anything is read.
 *
 * @throws UsageError for no agent or several, or `--yes` without `--fingerprint`
 */
function trustOptions(input: CommandInput): TrustOptions {
  const [typed, ...extra] = input.positionals;
  if (typed === undefined || extra.length > 0) {
    throw new UsageError(words.oneAgent());
  }
  const agent = printable(typed);
  const dir = typeof input.options["dir"] === "string" ? input.options["dir"] : undefined;
  const given = input.options["fingerprint"];
  const fingerprint = typeof given === "string" ? given : undefined;
  const yes = input.options["yes"] === true;
  if (yes && fingerprint === undefined) {
    throw new UsageError(words.yesNeedsFingerprint(), words.yesNeedsFingerprintFix(agent, dir));
  }
  return { typed, agent, dir, fingerprint, yes };
}

/** What a refusal names: the agent as typed, the user's `--dir`, the pin it shows and where its files are. */
interface RefusalFacts {
  readonly agent: string;
  readonly dir: string | undefined;
  readonly pin: InstructionPin;
  readonly about: InstructionsAbout;
}

/** "✕ That fingerprint doesn't match coder's instructions as they are now.", exit 3. */
function fingerprintNotCurrent(
  facts: RefusalFacts,
  check: InstructionQuestion | undefined,
): NotTrustedError {
  return new NotTrustedError({
    problem: words.fingerprintNotCurrent(facts.agent),
    fix: words.fingerprintNotCurrentFix(facts.agent, facts.dir),
    fingerprint: facts.pin.digest,
    check:
      check === undefined ? [] : instructionTrustLines(facts.agent, check, facts.pin, facts.about),
    action: null,
  });
}

/** No terminal, `CI` or `--json`, and no `--yes`: the list, and the command that trusts it. */
function noTerminal(
  facts: RefusalFacts,
  check: InstructionQuestion,
  lines: readonly Phrase[],
): NotTrustedError {
  return new NotTrustedError({
    problem: words.noTerminal(facts.agent, whyAsked(check)),
    fix: words.noTerminalFix(facts.agent, facts.pin.digest, facts.dir),
    fingerprint: facts.pin.digest,
    check: lines,
    action: null,
  });
}

/**
 * The dimmed line naming the agent's listed files with saved changes that
 * aren't committed, so aren't what this reviews; `undefined` when there are none.
 */
function notCommittedLine(
  reviewed: ReviewedFiles,
  file: AgentFile,
  agent: string,
  dir: string | undefined,
): Phrase | undefined {
  const listed = new Set(instructionPathsOf(reviewed.workspace, file));
  const files = reviewed.notCommitted.filter((path) => listed.has(path));
  if (files.length === 0) return undefined;
  return words.notCommitted(agent, files.map(printable), dir).phrase;
}

/** The ✓ line, then `after` when there is one, such as the line naming files not committed. */
function done(
  line: Phrase,
  json: Readonly<Record<string, unknown>>,
  after?: Phrase,
): CommandResult {
  const lines = [phrase`${markPart("done")} ${line}`, ...(after === undefined ? [] : [after])];
  return { exitCode: exitCode.ok, lines, json };
}

/** The agent as typed, made safe to print, for "✕ Couldn't trust coder's instructions: …". */
function typedAgent(input: CommandInput): string | undefined {
  const [typed] = input.positionals;
  return typed === undefined ? undefined : printable(typed);
}
