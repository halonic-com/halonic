import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { FileTrustStore, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { TrustCheck } from "@halonicjs/app";
import type { Clock, TrustRecord, TrustStore } from "@halonicjs/ports";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { filesOf, loadWorkspace, settingsPath } from "@halonicjs/workspace";
import {
  type CliCommand,
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { type CommandSearch, nodeCommandSearch } from "../../command-paths.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import type { Message } from "../../messages/define.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { trustMessages } from "../../messages/trust.ts";
import { NotTrustedError } from "../../not-trusted.ts";
import { shownDate, trustCheckLines } from "../../output/trust-check.ts";
import { shownPath } from "../../shown-path.ts";
import { dirOption, openWorkspaceDir, workspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";

/** What `trust` uses on this computer, so tests can hand it a memory store and a fixed clock. */
export interface TrustMachine {
  /** The trust records in the user's profile. */
  readonly store: TrustStore;
  /** Gives the time a person trusted a workspace. */
  readonly clock: Clock;
  /** Where the connectors' programs are looked for. */
  readonly commandSearch: CommandSearch;
}

/**
 * The trust records in the profile folder (`HALONIC_HOME`, or the system's
 * data folder), the computer's clock and this process's `PATH`.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeTrustMachine(): TrustMachine {
  return {
    store: new FileTrustStore(trustFolder(profileFolder(nodeProfileEnvironment()))),
    clock: systemClock,
    commandSearch: nodeCommandSearch(),
  };
}

/**
 * `halonic trust [--dir <folder>]` on the records `machine` keeps, so tests
 * can hand it their own (cli-output 3.5).
 */
export function createTrustCommand(machine: () => TrustMachine): CliCommand {
  return {
    name: "trust",
    usage: "[--dir <folder>] [--yes --fingerprint <fingerprint>] [--list] [--remove]",
    summary: trustMessages.summary(),
    action: (input) => trustMessages.action(givenDir(input)),
    options: {
      dir: dirOption,
      list: { type: "boolean", description: trustMessages.listOption() },
      remove: { type: "boolean", description: trustMessages.removeOption() },
      yes: { type: "boolean", description: trustMessages.yesOption() },
      fingerprint: {
        type: "string",
        valueName: "fingerprint",
        description: trustMessages.fingerprintOption(),
      },
    },
    async run(input, context) {
      if (input.options["list"] === true) {
        return await listTrusted(machine(), context.cwd);
      }
      if (input.options["remove"] === true) {
        return await removeTrust(machine(), input, context.cwd);
      }
      return await reviewAndTrust(machine(), input, context);
    },
  };
}

/** `halonic trust`: shows what a workspace can start and trusts it on this computer. */
export const trustCommand: CliCommand = createTrustCommand(nodeTrustMachine);

/**
 * Checks the workspace and, when it isn't trusted yet, shows the check and
 * asks; with a program that isn't pinned, asks a second time. Both answers
 * must be yes, or nothing is saved. `--yes` answers both, but only with the
 * `--fingerprint` of what the check showed (cli-output 1.7).
 *
 * @throws UsageError for `--yes` without `--fingerprint`, before anything is read
 * @throws NotTrustedError when the fingerprint given isn't the current one,
 *   or when nobody can answer and `--yes --fingerprint` weren't given
 */
async function reviewAndTrust(
  machine: TrustMachine,
  input: CommandInput,
  context: CommandContext,
): Promise<CommandResult> {
  const dir = givenDir(input);
  const given = input.options["fingerprint"];
  const fingerprint = typeof given === "string" ? given : undefined;
  if (input.options["yes"] === true && fingerprint === undefined) {
    throw new UsageError(
      trustMessages.yesNeedsFingerprint(),
      trustMessages.yesNeedsFingerprintFix(dir),
    );
  }
  const opened = await openWorkspaceDir(input, context);
  const workspace = await readWorkspaceTrust(opened, machine.commandSearch);
  const trust = cliTrustService(machine.store, machine.clock);
  const check = await trust.check(workspace.subject);
  const facts = { name: workspace.name, folder: opened.shown };
  const lines = trustCheckLines(check, facts);
  if (fingerprint !== undefined && fingerprint !== check.fingerprint) {
    throw fingerprintChanged(workspace.name, check, lines, dir);
  }
  if (check.status === "trusted") {
    return {
      exitCode: exitCode.ok,
      lines,
      json: { ...facts, status: "already-trusted", fingerprint: check.fingerprint },
    };
  }

  const trusted = await askToTrust(context, {
    name: workspace.name,
    check,
    lines,
    yes: input.options["yes"] === true,
    dir,
  });
  if (!trusted) {
    return { exitCode: exitCode.notTrusted, lines: [trustMessages.notTrusted().phrase], json: {} };
  }

  const granted = await trust.grant(workspace.subject, check.fingerprint, "cli");
  if (!granted.ok) {
    // The files changed between the check and the answer.
    throw fingerprintChanged(workspace.name, check, [], dir);
  }
  return {
    exitCode: exitCode.ok,
    lines: [marked(trustMessages.trusted(workspace.name))],
    json: { ...facts, status: "trusted", fingerprint: check.fingerprint },
  };
}

/** What {@link askToTrust} asks about. */
interface TrustQuestion {
  readonly name: string;
  readonly check: TrustCheck;
  /** The check's lines, shown before the first question and in the refusal. */
  readonly lines: readonly Phrase[];
  /** `--yes` with a `--fingerprint` that matched. */
  readonly yes: boolean;
  readonly dir: string | undefined;
}

/**
 * Asks whether to trust the workspace and, when a program isn't pinned,
 * whether to trust it anyway. True only when both answers are yes. A
 * matching fingerprint is the second yes too: the check that printed it
 * also printed the ! line, and the program is in it (HAL-2134).
 *
 * @throws NotTrustedError when nobody can answer and `--yes` wasn't given
 */
async function askToTrust(context: CommandContext, about: TrustQuestion): Promise<boolean> {
  const { name, check, lines, yes, dir } = about;
  const refusal = () =>
    new NotTrustedError({
      problem: trustMessages.noTerminal(name),
      fix: trustMessages.noTerminalFix(dir),
      fingerprint: check.fingerprint,
      check: lines,
      action: null,
    });
  const first = await context.ask({
    question: trustMessages.question(name),
    shownFirst: lines,
    yes,
    refusal,
  });
  if (!first || check.unpinned.length === 0) {
    return first;
  }
  return await context.ask({ question: trustMessages.notPinnedQuestion(), yes, refusal });
}

/** "✕ Couldn't trust Acme: it changed since that fingerprint was made.", with the check on stderr. */
function fingerprintChanged(
  name: string,
  check: TrustCheck,
  lines: readonly Phrase[],
  dir: string | undefined,
): NotTrustedError {
  return new NotTrustedError({
    problem: trustMessages.fingerprintChanged(),
    fix: trustMessages.fingerprintChangedFix(dir),
    fingerprint: check.fingerprint,
    check: lines,
    action: trustMessages.action(name),
  });
}

/**
 * `--list`: one line per trusted workspace, its name, folder and the day it
 * was trusted. `--list --json` adds the fingerprint; the lines don't.
 */
async function listTrusted(machine: TrustMachine, cwd: string): Promise<CommandResult> {
  const records = await cliTrustService(machine.store, machine.clock).list();
  if (records.length === 0) {
    return {
      exitCode: exitCode.ok,
      lines: [trustMessages.noneTrusted().phrase],
      json: { workspaces: [] },
    };
  }
  const workspaces = await Promise.all(records.map((record) => listed(record, cwd)));
  const rows = workspaces.map((workspace) => [
    phrase`${workspace.name}`,
    phrase`${workspace.folder}`,
    trustMessages.trustedOn(shownDate(workspace.trustedAt)).phrase,
  ]);
  return { exitCode: exitCode.ok, lines: columns(rows), json: { workspaces } };
}

/** A trusted workspace as `--list` shows it. */
async function listed(record: TrustRecord, cwd: string) {
  const folder = shownPath(cwd, record.location);
  return {
    name: await nameAt(record.location, folder),
    folder,
    fingerprint: record.fingerprint,
    trustedAt: record.grantedAt,
  };
}

/**
 * `--remove`: forgets the trust in the workspace, even when its record can't
 * be read or its folder is gone, so the user can always start over.
 */
async function removeTrust(
  machine: TrustMachine,
  input: CommandInput,
  cwd: string,
): Promise<CommandResult> {
  const dir = workspaceDir(input, cwd);
  const location = await realpath(dir.root).catch(() => resolve(dir.root));
  const name = await nameAt(location, dir.shown);
  await cliTrustService(machine.store, machine.clock).revoke(location);
  return {
    exitCode: exitCode.ok,
    lines: [marked(trustMessages.removed(name))],
    json: { name, folder: dir.shown, status: "removed" },
  };
}

/** The name in the workspace's `workspace.yaml`, or `fallback` when there's none to read. */
async function nameAt(location: string, fallback: string): Promise<string> {
  const store = new FolderDefinitionStore(location, fallback);
  if ((await store.read(settingsPath).catch(() => null)) === null) {
    return fallback;
  }
  const workspace = await loadWorkspace(store);
  return filesOf(workspace, "workspace")[0]?.value.name ?? fallback;
}

/** The `--dir` as the user typed it, for the fixes that name `halonic trust`. */
function givenDir(input: CommandInput): string | undefined {
  const dir = input.options["dir"];
  return typeof dir === "string" ? dir : undefined;
}

function marked(message: Message): Phrase {
  return phrase`${markPart("done")} ${message.phrase}`;
}
