import { realpath, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { type CommandSearch, nodeCommandSearch } from "@halonicjs/adapter-doctor-node";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { resolveRealPath } from "@halonicjs/adapter-harness-kit";
import type { AssistantAddedHosts } from "@halonicjs/app";
import type { Clock, KeyOrigins, TrustStore } from "@halonicjs/ports";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { reachesOnlyTheTestModel } from "@halonicjs/workspace";
import { profileAssistantAdded } from "../../assistant-added.ts";
import {
  type CliCommand,
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { keyAddressLists } from "../../key-address-lists.ts";
import type { Message } from "../../messages/define.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { trustMessages } from "../../messages/trust.ts";
import { NotTrustedError } from "../../not-trusted.ts";
import { printable } from "../../output/printable.ts";
import {
  type TrustChangesDocument,
  trustChangesDocument,
} from "../../output/trust-changes-json.ts";
import {
  type FingerprintedCheck,
  notCommittedLines,
  trustCheckLines,
} from "../../output/trust-check.ts";
import { type PluginSetup, setupPluginsFolder } from "../../plugin-host.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import { nodeSandboxWorks } from "../../sandbox-works.ts";
import { profileKeyOrigins } from "../../secret-host.ts";
import { installedPluginHosts, type PluginHosts } from "../../sheet-hosts.ts";
import { dirOption, openWorkspaceDir, workspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { trustInstructionsCommand } from "./instructions.ts";
import { isPluginRecord, listTrusted, nameAt } from "./list.ts";
import { trustPlugin } from "./plugin.ts";
import { reviewedVersion } from "./reviewed-version.ts";
import { optionForWord, refuseWords } from "./words.ts";

/** What `trust` uses on this computer, so tests can hand it a memory store and a fixed clock. */
export interface TrustMachine {
  /** The trust records in the user's profile. */
  readonly store: TrustStore;
  /** Gives the time a person trusted a workspace. */
  readonly clock: Clock;
  /** Where the connectors' programs are looked for. */
  readonly commandSearch: CommandSearch;
  /** Whether the sandbox works here; left out, the check shows no program's sites. */
  readonly sandboxWorks?: () => Promise<boolean>;
  /** The hosts of the plugins installed here; left out, the check shows no plugin's hosts. */
  readonly pluginHosts?: () => Promise<PluginHosts>;
  /** The stored keys' lists of addresses; left out, the check reads no key's list. */
  readonly keyOrigins?: KeyOrigins;
  /** Opens the workspace's history, for the version a run would start; git on the `PATH` when left out. */
  readonly history?: OpenWorkspaceHistory;
  /**
   * The hosts the assistant added that the person didn't name, from the
   * profile's review folder for the workspace at this real path (HAL-525);
   * left out, the check marks none.
   */
  readonly assistantAdded?: (location: string) => Promise<AssistantAddedHosts>;
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
    sandboxWorks: nodeSandboxWorks,
    pluginHosts: () => installedPluginHosts(),
    keyOrigins: profileKeyOrigins(),
    assistantAdded: profileAssistantAdded,
  };
}

/**
 * `halonic trust [--dir <folder> | --plugin <id>]` on the records `machine`
 * keeps and the plugins `plugins` opens, so tests can hand it their own
 * (cli-output 3.5 and 3.6).
 */
export function createTrustCommand(
  machine: () => TrustMachine,
  plugins: PluginSetup = {},
  instructions: CliCommand = trustInstructionsCommand,
): CliCommand {
  return {
    name: "trust",
    usage:
      "[--dir <folder> | --plugin <id>] [--yes --fingerprint <fingerprint>] [--list] [--remove]",
    subcommands: [instructions],
    // So `halonic trust revoke` reaches `run`, which refuses it with the option it likely means.
    argumentsBesideSubcommands: true,
    strayArgumentFix: optionForWord,
    summary: trustMessages.summary(),
    action: trustAction,
    options: {
      dir: dirOption,
      plugin: {
        type: "string",
        valueName: "id",
        description: pluginMessages.trustPluginOption(),
      },
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
      refuseWords(input.positionals);
      const plugin = input.options["plugin"];
      if (typeof plugin === "string") {
        return await trustPlugin(plugin, input, context, plugins);
      }
      if (input.options["list"] === true) {
        const { store, clock } = machine();
        return await listTrusted(store, clock, context.cwd);
      }
      if (input.options["remove"] === true) {
        return await removeTrust(machine(), input, context, plugins);
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
 * `--fingerprint` of what the check showed (cli-output 1.7). A workspace
 * whose runs can only reach the test model needs no trust: it says so and
 * saves nothing.
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
  const history = machine.history ?? openGitHistory;
  const reviewed = await reviewedVersion(opened, history);
  const workspace = await readWorkspaceTrust(opened, machine.commandSearch, reviewed.version);
  const facts = { name: workspace.name, folder: opened.shown };
  // The name comes from `workspace.yaml`, so each sentence quotes it escaped:
  // the question and the refusal follow the check on the same screen, and a
  // cursor move in the name could rewrite the check above them.
  const name = printable(workspace.name);
  // The rule `run` and `doctor` skip trust by: a run there starts nothing,
  // so there is nothing to check, ask or save (HAL-6631). A `--fingerprint`
  // has nothing to match, so it is left unused.
  if (reachesOnlyTheTestModel(workspace.subject)) {
    return {
      exitCode: exitCode.ok,
      lines: [marked(trustMessages.notNeeded(name)), ...notCommittedLines(reviewed.notCommitted)],
      json: { ...facts, status: "not-needed" },
    };
  }
  const trust = cliTrustService(machine.store, machine.clock);
  const check = await trust.check(workspace.subject);
  assertTrustable(check, workspace);
  const lines = trustCheckLines(check, {
    ...facts,
    sandboxWorks: (await machine.sandboxWorks?.()) === true,
    pluginHosts: (await machine.pluginHosts?.()) ?? new Map(),
    keyAddresses: await keyAddressLists(check, machine.keyOrigins),
    notCommitted: reviewed.notCommitted,
    assistantAdded: (await machine.assistantAdded?.(workspace.subject.location)) ?? new Map(),
  });
  const changes =
    check.status === "changed" ? trustChangesDocument(check.changes, check.trustedAt) : undefined;
  if (fingerprint !== undefined && fingerprint !== check.fingerprint) {
    throw fingerprintNotCurrent({ name, check, lines, dir, changes });
  }
  if (check.status === "trusted") {
    return {
      exitCode: exitCode.ok,
      lines,
      json: { ...facts, status: "already-trusted", fingerprint: check.fingerprint },
    };
  }

  const trusted = await askToTrust(context, {
    name,
    check,
    lines,
    yes: input.options["yes"] === true,
    dir,
    changes,
  });
  if (!trusted) {
    return { exitCode: exitCode.notTrusted, lines: [trustMessages.notTrusted().phrase], json: {} };
  }

  // Read the version again: it can change while the person answers, and only
  // what the check showed them is trusted.
  const again = await reviewedVersion(opened, history);
  const answered = await readWorkspaceTrust(opened, machine.commandSearch, again.version);
  const granted = await trust.grant(answered.subject, check.fingerprint, "cli");
  if (!granted.ok) {
    // The files changed between the check and the answer: the refusal gives
    // the fingerprint they have now, as a check run now would.
    const now = { ...check, fingerprint: granted.error.fingerprint };
    throw fingerprintNotCurrent({ name, check: now, lines: [], dir, changes });
  }
  return {
    exitCode: exitCode.ok,
    lines: [marked(trustMessages.trusted(name))],
    json: {
      ...facts,
      status: "trusted",
      fingerprint: check.fingerprint,
      ...(changes === undefined ? {} : { changes }),
    },
  };
}

/** What a refusal of `trust` shows: the check, and what changed since it was trusted. */
interface TrustRefusalFacts {
  /** The workspace's name, escaped for the terminal. */
  readonly name: string;
  readonly check: FingerprintedCheck;
  /** The check's lines, shown before the first question and in the refusal. */
  readonly lines: readonly Phrase[];
  readonly dir: string | undefined;
  /** What changed since it was trusted, for `--json`; left out when it never was. */
  readonly changes: TrustChangesDocument | undefined;
}

/** What {@link askToTrust} asks about. */
interface TrustQuestion extends TrustRefusalFacts {
  /** `--yes` with a `--fingerprint` that matched. */
  readonly yes: boolean;
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
  const { name, check, lines, yes, dir, changes } = about;
  const refusal = () =>
    new NotTrustedError({
      problem: trustMessages.noTerminal(name, changes !== undefined),
      fix: trustMessages.noTerminalFix(check.fingerprint, dir),
      fingerprint: check.fingerprint,
      check: lines,
      action: null,
      changes,
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

/** "✕ That fingerprint doesn't match Acme as it is now.", with the check on stderr. */
function fingerprintNotCurrent(facts: TrustRefusalFacts): NotTrustedError {
  return new NotTrustedError({
    problem: trustMessages.fingerprintNotCurrent(facts.name),
    fix: trustMessages.fingerprintNotCurrentFix(facts.dir),
    fingerprint: facts.check.fingerprint,
    check: facts.lines,
    action: null,
    changes: facts.changes,
  });
}

/**
 * `--remove`: forgets the trust in the workspace, even when its record can't
 * be read or its folder is gone, so the user can always start over. When
 * there was no record, it says so instead of "Removed trust" (C548 5). A
 * plugin in this profile's plugins folder goes the `--plugin` way, so it is
 * signed out first (`app.plugin-sign-out`) and named as a plugin, also once
 * its trust is gone.
 */
async function removeTrust(
  machine: TrustMachine,
  input: CommandInput,
  context: CommandContext,
  plugins: PluginSetup,
): Promise<CommandResult> {
  const dir = workspaceDir(input, context.cwd);
  // A gone folder keeps its parent's real path, as the record has it, so a
  // Windows short name such as `RUNNER~1` still finds the record.
  const location = (await resolveRealPath(resolve(dir.root)))?.real ?? resolve(dir.root);
  if (await isInstalledPlugin(machine.store, location, plugins)) {
    // The folder's name in the plugins folder is the plugin's id. `--dir`
    // named the folder, and `--plugin` refuses it, so only `--remove` goes on.
    const removeOnly: CommandInput = { positionals: [], options: { remove: true } };
    return await trustPlugin(basename(location), removeOnly, context, plugins);
  }
  const name = await nameAt(location, dir.shown);
  // A record that can't be read is still there, and revoking deletes it.
  const hadTrust = await cliTrustService(machine.store, machine.clock).revoke(location);
  if (!hadTrust) {
    return {
      exitCode: exitCode.ok,
      lines: [marked(trustMessages.nothingToRemove(printable(name)))],
      json: { name, folder: dir.shown, status: "not-trusted" },
    };
  }
  return {
    exitCode: exitCode.ok,
    lines: [marked(trustMessages.removed(printable(name)))],
    json: { name, folder: dir.shown, status: "removed" },
  };
}

/**
 * Whether `location` is a plugin in this profile's plugins folder whose trust
 * goes the `--plugin` way: one with a plugin's record, or with no record at
 * all, as once its trust was removed, so it is named as a plugin, or with a
 * record that can't be read, so it is signed out too (HAL-15476). A plugin's
 * record anywhere else (a moved profile folder, or `--dir` naming a copy) is
 * removed by location, as a workspace's is: going by its folder's name would
 * sign out and untrust another plugin with that id and leave the record
 * named.
 */
async function isInstalledPlugin(
  store: TrustStore,
  location: string,
  plugins: PluginSetup,
): Promise<boolean> {
  const folder = setupPluginsFolder(plugins);
  const realFolder = await realpath(folder).catch(() => resolve(folder));
  if (dirname(location) !== realFolder) return false;
  const record = await store.get(location).catch(() => "unreadable" as const);
  if (record === "unreadable" || record === null) return await isFolder(location);
  return isPluginRecord(record);
}

/** Whether `path` is a folder there now, so a plugin folder that is gone is removed by location. */
async function isFolder(path: string): Promise<boolean> {
  return await stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  );
}

/**
 * What `trust` was doing, for its "✕ Couldn't …: …", in the order `run` takes
 * the options, so `--list` and `--remove` don't say they were trusting (HAL-15427).
 */
function trustAction(input: CommandInput): Message {
  const removing = input.options["remove"] === true;
  const plugin = givenPlugin(input);
  if (plugin !== undefined) {
    return removing ? trustMessages.removeAction(plugin) : trustMessages.action(plugin);
  }
  if (input.options["list"] === true) return trustMessages.listAction();
  const dir = givenDir(input);
  return removing ? trustMessages.removeAction(dir) : trustMessages.action(dir);
}

/** The `--plugin` id, made safe to print, for "✕ Couldn't trust weather: …". */
function givenPlugin(input: CommandInput): string | undefined {
  const plugin = input.options["plugin"];
  return typeof plugin === "string" ? printable(plugin) : undefined;
}

/** The `--dir` as the user typed it, for the fixes that name `halonic trust`. */
function givenDir(input: CommandInput): string | undefined {
  const dir = input.options["dir"];
  return typeof dir === "string" ? dir : undefined;
}

function marked(message: Message): Phrase {
  return phrase`${markPart("done")} ${message.phrase}`;
}
