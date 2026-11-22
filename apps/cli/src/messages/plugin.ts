import {
  type LocalToolState,
  type PluginsFolderAccess,
  pluginTrustLocationHeadings,
  pluginTrustMoreFilesText,
  pluginTrustRunsLabel,
  pluginTrustRunsText,
  pluginTrustSectionHeadings,
  pluginTrustToolsIntro,
} from "@halonicjs/app";
import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/** A plugin's state on `plugin list`: Studio's page states (T12). */
export type PluginState = "on" | "notTrusted" | "changed";

const stateWords: Readonly<Record<PluginState, string>> = {
  on: "on",
  notTrusted: "not trusted yet",
  changed: "changed since you trusted it",
};

/**
 * The schema's plain words for a value YAML read as a number where text goes,
 * such as `version: 1.0` (schema-kit's plain words, HAL-14277).
 */
const numberForText = / is text: write "-?[\d.]+" in quotes\.$/u;

/** How the format starts a check's words: `Plugin "weather": `. */
const pluginNamePrefix = /^Plugin "[^"]*": /u;

/**
 * Whether a check's words already start with the field's name, as the
 * schema's plain words do (`name needs text, not a list.`), so the field
 * isn't named twice. The plain words name a field from its last key on.
 */
function namesField(reason: string, field: string): boolean {
  const lastName = field.split(".").at(-1) ?? field;
  return reason.startsWith(`${lastName} `);
}

/**
 * The sentences of `halonic plugin add | list | remove` (cli-output 1.9 and
 * 3.6). The trust check's sections, headings and order are Studio's
 * (microcopy 24 T6–T9), without "In Studio", because 0.1 has no Studio to
 * draw a plugin's settings, commands, cards or panel (HAL-6417); a section
 * shows only when it has something in it.
 * Plugins live in the profile, so nothing here says "into your workspace".
 */
export const pluginMessages = defineMessages("plugin", {
  summary: () => phrase`Add, list or remove plugins`,
  addSummary: () => phrase`Add a plugin from a folder or a git address and ask whether to trust it`,
  listSummary: () => phrase`List the plugins and whether each is on`,
  /** What `plugin list` was doing, for "✕ Couldn't list the plugins: …". */
  listAction: () => phrase`list the plugins`,
  /** What `plugin add` was doing, for "✕ Couldn't add the plugin: …". */
  addAction: () => phrase`add the plugin`,
  /** What `plugin remove` was doing, for "✕ Couldn't remove the plugin: …". */
  removeAction: () => phrase`remove the plugin`,

  /** The live line while a git address is copied; without a commit, the remote's default branch is. */
  copying: (name: string, commit: string | undefined) =>
    commit === undefined
      ? phrase`Copying ${name} into your plugins folder…`
      : phrase`Copying ${name} at ${commit} into your plugins folder…`,
  /**
   * With a !, when no commit was given. The pin is the full commit id,
   * because a remote fetches a commit only by its full id.
   */
  latestCommit: (commit: string, branch: string, pin: string) =>
    phrase`Using commit ${commit}, the latest on ${branch}. Add @${pin} to pin it.`,
  /**
   * After the copy, before the check: the private paths the sandbox denies
   * that the folder held and the copy left out (HAL-13713), with a !.
   */
  leftOut: (paths: string) => phrase`Not copied, because they're private: ${paths}`,
  /**
   * The check's first line, and the question at its end, framed with [y/N] by the question line.
   * While its backend would be off on this computer, a yes doesn't turn it on, so the question
   * doesn't promise it (C626 #1, HAL-15752).
   */
  trustQuestion: (name: string, turnsOn = true) =>
    turnsOn ? phrase`Trust ${name} and turn it on?` : phrase`Trust ${name}?`,
  toolsHeading: () => phrase`Tools for agents`,
  reads: () => phrase`Reads`,
  changesThings: () => phrase`Changes things`,
  sends: () => phrase`Sends`,
  /** The first line under Tools for agents, as the shared model words it: every tool asks first. */
  toolsIntro: () => phrase`${pluginTrustToolsIntro}`,
  programsHeading: () => phrase`Programs`,
  /**
   * Under each program, and on `plugin list` when programs can't run: where they run, in
   * Studio's words (core's `pluginTrustRunsText`). Without a state, the line that holds either way.
   */
  programsRun: (state: LocalToolState["kind"] | undefined) =>
    phrase`${pluginTrustRunsLabel}: ${pluginTrustRunsText(state)}`,
  /** Under a plugin with programs on `plugin list`: "Programs: Doesn't start on this computer: …", in Studio's words. */
  listProgramsRun: (state: LocalToolState["kind"]) =>
    phrase`${pluginTrustSectionHeadings.programs}: ${pluginTrustRunsText(state)}`,
  secretsHeading: () => phrase`Secrets`,
  /** After a backend secret's name: "goes only to api.weather.example". A program's says more (HAL-12638). */
  secretGoesTo: (host: string) => phrase`goes only to ${host}`,
  signInsHeading: () => phrase`Sign-ins`,
  /** Under a sign-in's name and purpose: the approved trust check line, in core's words (HAL-8619). */
  signInTrustLine: (line: string) => phrase`${line}`,
  /** The ! line under the trust line, when the sign-in page and the token address are different services. */
  signInTokenHostWarning: (warning: string) => phrase`${warning}`,
  addressesHeading: () => phrase`Addresses`,
  /** The heading of the plugin's folder line, as the shared model words it. */
  folderHeading: () => phrase`${pluginTrustLocationHeadings.folder}`,
  /** The line under the plugin's folder: where it was copied from, as `plugin list` writes it (HAL-15142). */
  copiedFrom: (source: string) => phrase`Copied from ${source}`,
  /**
   * `plugin list`'s source for a plugin added from a folder: it runs its own
   * copy, so editing the folder changes nothing until `plugin add --update`
   * (C45, HAL-14325). A git source's commit already says which copy it is.
   */
  listCopiedFrom: (source: string, day: string) => phrase`copied from ${source} on ${day}`,
  /** The heading of the list of files the fingerprint covers. */
  filesHeading: () => phrase`${pluginTrustLocationHeadings.files}`,
  /** The last line of the file list when more files follow the ones shown. */
  moreFiles: (count: number) => phrase`${pluginTrustMoreFilesText(count)}`,
  /** The caption under a plugin's fingerprint: what it covers besides the files listed above it. */
  fingerprintCovers: () => phrase`Covers the manifest and the files above.`,
  /** T9's last line, under every plugin trust check. */
  notChecked: () =>
    phrase`Plugin code runs apart from the rest of Halonic. Halonic doesn't check what the plugin does with what it's given.`,

  /** A host that is the value of one of the plugin's settings, so it isn't known until it is set. */
  hostFromSetting: (setting: string) => phrase`the address in the setting ${setting}`,
  /** The refusal when a plugin with the id is already added; adding it again would be a conflict. */
  alreadyAdded: (id: string) => phrase`${id} is already added.`,
  /** Under {@link alreadyAdded}: `--update` replaces it and keeps its settings, which `remove` drops (C45, HAL-14325). */
  alreadyAddedFix: () =>
    phrase`To put this version in its place and keep its settings, run the same command with --update.`,
  /** Under {@link alreadyAdded} when even `--update` couldn't place it, such as for a folder that is a link. */
  alreadyAddedRemoveFix: (id: string) =>
    phrase`To add this version, remove it first: halonic plugin remove ${id}`,
  /** `--update`'s help line. */
  updateOption: () =>
    phrase`Put it in place of the added plugin with the same id and keep its settings; changed files are off until you trust them`,
  /** `plugin add` without a folder or git address; line 1 says what's missing (cli-output 1.3). */
  addNeedsSource: () => phrase`halonic plugin add needs a folder or a git address.`,
  addUsage: () => phrase`halonic plugin add <folder or git address>[@commit]`,
  /**
   * `--yes` alone: the fingerprint comes from the check, which only an earlier
   * add without it printed: above the question in a terminal, and as the last
   * stdout line without one.
   */
  yesNeedsFingerprintFix: () =>
    phrase`Add it without --yes to see the check; the fingerprint is in it, above the question.`,
  /** Line 1 of a source that is there but isn't a folder this command can read. */
  notAFolder: (path: string) => phrase`${path} isn't a folder.`,
  /** Line 1 of a source that is neither a folder nor a git address, and isn't there. */
  noFolder: (path: string) => phrase`there's no folder ${path}.`,
  /**
   * Line 1 when the git found drops Halonic's git settings, so a git address
   * can't be fetched safely: `unavailable`, exit 9, with run's fix (HAL-12342).
   */
  gitNotItself: (git: string) =>
    phrase`the git at ${git} doesn't pass Halonic's git settings on to git, so the plugin can't be fetched safely.`,

  added: (name: string, version: string) => phrase`Added ${name} ${version}. It's on.`,
  /** Answer No, or Enter, with a !: added but off, exit 3 (Studio's Not now, D4). */
  addedButOff: (name: string, id: string) =>
    phrase`${name} is added but off. Nothing from it runs until you trust it: halonic trust --plugin ${id}`,
  /**
   * No terminal, or `CI` set, without `--yes --fingerprint`: the copy is made,
   * then it ends as a No does, added but off with a ! and exit 3, in F16's two
   * lines (cli-output 3.6, revision 24).
   */
  addNoTerminal: (name: string) =>
    phrase`${name} is added but off, because there's no terminal to ask you to trust it.`,
  /** The fix names `trust --plugin`, because a second `plugin add` would be a conflict. */
  addNoTerminalFix: (id: string) =>
    phrase`Review it with halonic trust --plugin ${id}, then pass --yes --fingerprint <fingerprint>.`,
  /**
   * Under {@link addNoTerminal} and {@link offNoTerminal}: the command that
   * trusts what the check above showed, with its fingerprint filled in, ready
   * to copy, as a workspace's trust gives it (HAL-15123).
   */
  noTerminalFix: (id: string, fingerprint: string) =>
    phrase`Read the list above, then run: halonic trust --plugin ${id} --yes --fingerprint ${fingerprint}`,
  /**
   * {@link noTerminalFix} for a plugin that stays off on this computer once
   * trusted: the lines above say what turns it on, so trusting it is only
   * the choice to trust it anyway, never the last step to turn it on
   * (C656 #3, HAL-15947).
   */
  noTerminalFixOffHere: (id: string, fingerprint: string) =>
    phrase`Read the list above. To trust it anyway, run: halonic trust --plugin ${id} --yes --fingerprint ${fingerprint}`,
  /** After the refusal's reason from the attack-test list; never more detail than the reason. */
  refusedSourceFix: () => phrase`Check the folder or git address.`,
  /** The refusal for a source that is, holds or is inside the profile folder or a workspace's data (HAL-13713). */
  halonicData: () =>
    phrase`a plugin can't be added from Halonic's own data, or from a folder that holds it.`,
  /**
   * A problem in the plugin's manifest, placed as `validate` places one:
   * "plugin.yaml 4:10 id: use lower-case words…". A check over the parsed
   * plugin has no line, and a YAML syntax error no field (HAL-14304).
   */
  manifestProblem: (file: string, where: string | undefined, field: string, message: string) => {
    const at = where === undefined ? file : `${file} ${where}`;
    // The format names the plugin in front of a check's words; the file already says which one.
    const reason = message.replace(pluginNamePrefix, "");
    // A version also needs three numbers, which writing it in quotes alone doesn't give.
    if (field === "version" && numberForText.test(reason)) {
      return phrase`${at} version is a number here; write it in quotes, with three numbers, such as "1.0.0".`;
    }
    return field === "" || namesField(reason, field)
      ? phrase`${at} ${reason}`
      : phrase`${at} ${field}: ${reason}`;
  },
  /** The fix after a problem in the manifest: the file is what to change, not the folder. */
  manifestFix: (file: string) => phrase`Fix ${file}, then run halonic plugin add again.`,
  /** The fix when the folder has no manifest but one folder in it has (Nina's C340 row 26). */
  nestedManifest: (manifest: string, folder: string) =>
    phrase`There's a ${manifest} in ${folder}/. Did you mean that folder?`,

  /** A plugin's state on its `list` line. */
  state: (state: PluginState) => phrase`${stateWords[state]}`,
  /** After a state that needs trust: "! not trusted yet · halonic trust --plugin tides". */
  stateWithFix: (state: Exclude<PluginState, "on">, id: string) =>
    phrase`${stateWords[state]} ${markPart("separator")} halonic trust --plugin ${id}`,
  /** A folder in the plugins folder that can't be read or checked, with a ✕. */
  broken: () => phrase`can't be read or checked`,
  noPlugins: () => phrase`No plugins yet. Add one with halonic plugin add <folder or git address>.`,
  /** The refusal when the plugins folder itself can't be listed by the person (HAL-15785). */
  folderUnreadable: (folder: string) =>
    phrase`The plugins folder ${folder} can't be read by your user account.`,
  /** Under {@link folderUnreadable}, as the secrets file's (HAL-15511). `folderWord` is the folder as one shell word. */
  folderUnreadableFix: (access: PluginsFolderAccess, folderWord: string) => {
    if (access === "windows") {
      return phrase`Give your user account access to it in the folder's Properties, under Security, then run again.`;
    }
    if (access === "another-user") {
      return phrase`It belongs to another user: run sudo chown "$(id -un)" ${folderWord}, then chmod 700 ${folderWord}, then run again.`;
    }
    return phrase`Run chmod 700 ${folderWord}, then run again.`;
  },

  // HAL-14296 (C41 on HAL-14271): a plugin connector's plugin that is added
  // but off, as `tools review` and `tools approve` warn about it.
  /** With a !: the plugin is off, so an agent gets none of its tools yet. */
  pluginOff: (state: Exclude<PluginState, "on">, id: string) =>
    phrase`${id} is off: ${stateWords[state]} ${markPart("separator")} halonic trust --plugin ${id}`,
  /** With a !: the plugin's folder can't be read or checked, so it's off, and what to do (C609, HAL-15656). */
  pluginBroken: (id: string) =>
    phrase`${id} can't be read or checked, so it's off. Remove it with halonic plugin remove ${id}, then add a version that works.`,

  /**
   * `remove`'s question, framed with [y/N]. The API key is named only when one
   * is stored on this computer; on 0.1's command line none is, because it
   * reads keys from HALONIC_SECRET_…, so it gets the shorter one.
   */
  removeQuestion: (name: string, hasStoredSecret: boolean) =>
    hasStoredSecret
      ? phrase`Remove ${name}? Its settings and the API key you entered are removed from this computer.`
      : phrase`Remove ${name}? Its settings are removed from this computer.`,
  removed: (name: string, version: string) => phrase`Removed ${name} ${version} and its trust.`,
  /** The same for a plugin that can't be read, so it has no version: named by its id. */
  removedUnread: (id: string) => phrase`Removed ${id} and its trust.`,
  /** `plugin remove` without an id; line 1 says what's missing (cli-output 1.3). */
  removeNeedsId: () => phrase`halonic plugin remove needs the plugin's id.`,
  removeUsage: () => phrase`halonic plugin remove <id> [--yes]`,
  removeYesOption: () => phrase`Remove it without asking.`,
  /** A secret the host couldn't delete, by its declared name; its folder and settings are kept. */
  secretNotDeleted: (secret: string, reason: string) =>
    phrase`its secret ${secret} couldn't be deleted: ${reason}`,
  /** Names the id, so the fix can be run as it is. */
  secretNotDeletedFix: (id: string) =>
    phrase`Run halonic plugin remove ${id} again to finish removing it.`,
  /** Answer No, or Enter: exit 1. */
  notRemoved: (name: string) => phrase`Not removed. ${name} is still added.`,
  /** No terminal, or `CI` set, without `--yes`: exit 2 (F6). No secrets: the CLI stores none. */
  removeNoTerminal: (name: string) =>
    phrase`Removing ${name} deletes its settings, and there's no terminal to ask you.`,
  removeNoTerminalFix: () => phrase`To remove it anyway, pass --yes.`,
  /** `halonic plugin remove`'s line in the help (W11). No secrets: the CLI stores none. */
  removeHelp: () => phrase`Remove a plugin and its settings`,
  unknownPlugin: (name: string) => phrase`There's no plugin called "${name}".`,
  unknownPluginNear: (name: string, near: string) =>
    phrase`There's no plugin called "${name}". Did you mean ${near}?`,
  unknownPluginFix: () => phrase`See them with halonic plugin list.`,
  /** `trust --plugin` on a plugin that can't be read or checked; `plugin list` would only show it as broken. */
  brokenPluginFix: (id: string) =>
    phrase`Remove it with halonic plugin remove ${id}, then add a version that works.`,

  /** `halonic trust --plugin <id>`'s option. */
  trustPluginOption: () =>
    phrase`Trust the plugin with this id and turn it on, instead of a workspace.`,
  /** `--plugin` with `--dir` or `--list`: wrong usage, exit 2. A plugin id is never a workspace folder. */
  trustPluginWith: (option: string) => phrase`--plugin can't go with --${option}.`,
  trustPluginWithFix: () =>
    phrase`Run halonic trust --plugin <id>, with --yes --fingerprint <fingerprint> or --remove if you need them.`,
  /** Answer yes: exit 0. */
  trustedOn: (name: string) => phrase`${name} is on now.`,
  /** With a ✓, when it's trusted as it is now; nothing is asked. */
  alreadyOn: (name: string, trustedOn: string) =>
    phrase`${name} is already on. Nothing changed since ${trustedOn}.`,

  // HAL-15080 (check C540 #2): a trusted plugin whose backend doesn't start
  // here, because its code doesn't run in the sandbox on this computer and
  // the command never runs it without. R13's words, as Studio's page says it.
  /** With a !, in place of "is on now". */
  trustedButOffHere: (name: string) =>
    phrase`${name} is trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.`,
  /** With a !, in place of "is already on". */
  alreadyTrustedButOffHere: (name: string) =>
    phrase`${name} is already trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.`,
  /** With a !, in place of `plugin add`'s "Added … It's on.". */
  addedButOffHere: (name: string, version: string) =>
    phrase`Added ${name} ${version}. It's trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.`,
  /** `plugin add --update`'s words for each of the lines above, once it replaced the added copy (C45, HAL-14325). */
  updated: (name: string, version: string) => phrase`Updated ${name} ${version}. It's on.`,
  /** In place of {@link updated} when the new copy's files are the ones trusted, so nothing was asked. */
  updatedUnchanged: (name: string, version: string) =>
    phrase`Updated ${name} ${version}. Its files are the ones you trusted, so it's still on.`,
  updatedButOff: (name: string, id: string) =>
    phrase`${name} is updated but off. Nothing from it runs until you trust it: halonic trust --plugin ${id}`,
  updateNoTerminal: (name: string) =>
    phrase`${name} is updated but off, because there's no terminal to ask you to trust it.`,
  updatedButOffHere: (name: string, version: string) =>
    phrase`Updated ${name} ${version}. It's trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.`,
  /**
   * With a !, above the trust question while its backend would be off here:
   * a yes trusts it but doesn't turn it on (C565 row 5, HAL-15373).
   */
  trustWontTurnOn: (name: string) =>
    phrase`Trusting ${name} won't turn it on: it stays off on this computer until you allow plugins and integrations to run without the sandbox.`,
  /** Under the reason: where the yes can be given, and why not here (C565 row 2, HAL-15373). */
  offHereAllow: (name: string) =>
    phrase`Or allow this in the Halonic desktop app: Settings ${markPart("studioPath")} Plugins ${markPart("studioPath")} ${name} ${markPart("studioPath")} Review. The halonic command runs plugin code only in the sandbox.`,
  /** The state on its `plugin list` line, with a !. */
  offHereState: () => phrase`off on this computer`,
  /** Answer No, or Enter, with a !: exit 3. */
  stillOff: (name: string) =>
    phrase`${name} is still off. Nothing from it runs until you trust it.`,
  /** No terminal, or `CI` set, without `--yes --fingerprint`: exit 3 (F16). */
  offNoTerminal: (name: string) =>
    phrase`${name} is off, because there's no terminal to ask you to trust it.`,
  /** `--plugin <id> --remove`, word for word from the words check on HAL-1991. */
  trustRemoved: (name: string) =>
    phrase`Removed trust for ${name}. Nothing from this plugin runs until you trust it.`,
  /** With a ✓, under {@link trustRemoved} or {@link removed}, when it signed out the plugin's sign-ins. */
  signedOut: (signIns: readonly string[]) => phrase`Signed you out of ${signIns.join(", ")}.`,
  /**
   * With a !, under {@link signedOut}, when the provider didn't confirm, or
   * there was no address to revoke at: Studio's words after **Sign out**,
   * with the step that ends the token at the provider (HAL-15807).
   */
  signedOutNotConfirmed: (tokens: number) =>
    tokens === 1
      ? phrase`You're signed out here. The provider didn't confirm the sign-out, so the token may still work there until it expires. To end it now, remove the access you gave in your account settings at the provider.`
      : phrase`You're signed out here. The provider didn't confirm the sign-out, so the tokens may still work there until they expire. To end them now, remove the access you gave in your account settings at the provider.`,

  /**
   * A plugin's backend doesn't start for lack of trust (`PluginBackendNotTrustedError`
   * reasons), by plugin id. Each says why, and its `…Fix` says what to do next (HAL-7941).
   */
  startNotTrusted: (id: string) =>
    phrase`The plugin ${id} runs code, so its backend starts only once you trust it.`,
  startNotTrustedFix: (id: string) =>
    phrase`Review and trust it with halonic trust --plugin ${id}.`,
  startChanged: (id: string) =>
    phrase`The plugin ${id} changed since you trusted it, so its backend doesn't start.`,
  startChangedFix: (id: string) =>
    phrase`Review what changed and trust it again with halonic trust --plugin ${id}.`,
  startRecordUnreadable: (id: string) =>
    phrase`The plugin ${id} doesn't start: Halonic can't read its trust record.`,
  /** Trusting writes the record again, as `doctor` says of a workspace's. */
  startRecordUnreadableFix: (id: string) =>
    phrase`Trust it again with halonic trust --plugin ${id}, which writes the record again.`,
  /** A trust status Halonic doesn't know: neutral, because the person may have trusted it. */
  startNotChecked: (id: string) =>
    phrase`The plugin ${id} doesn't start: Halonic couldn't check whether you trust it.`,
  startNotCheckedFix: () => phrase`See where it stands with halonic plugin list.`,
  /** For `PluginSecretNameMissingError` (its key `plugin-secret-name-missing`): a bug in Halonic, so nothing for the person to do. */
  secretNameMissing: (plugin: string, secret: string) =>
    phrase`Halonic can't find where the plugin ${plugin} stores its secret ${secret}. This is a bug in Halonic, not something you did.`,
});
