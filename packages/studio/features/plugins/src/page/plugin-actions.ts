// What a plugin's page does through the app, and its words: the ⋮ menu, Remove trust, Remove
// plugin… and the can't-load actions (plugin screens design section 7, microcopy 24 T12 and T13,
// UX acceptance checklist 6.2 and 6.5, fallbacks G4 and G8). The plugin's name, labels and
// titles are only ever a value in these lines.

import type { PluginTrustChanges } from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import { lowerAfterColon } from "@halonicjs/studio-shell";
import type { ProgramsRun } from "../trust/trust-text.ts";

/** How removing a plugin ended: core's `PluginService.remove`. */
export type PluginRemoveOutcome =
  | { readonly kind: "removed" }
  /** One of its secrets couldn't be deleted; its folder and settings are kept, so removing again finishes. */
  | { readonly kind: "secret"; readonly secret: string; readonly reason: string };

/** A connector that uses a plugin, and the workspace it is in. Plugins are installed per computer. */
export interface PluginUse {
  readonly connector: string;
  readonly workspace: string;
}

/**
 * What **Check for updates** (or **Update from folder**) found. Nothing is changed on the computer
 * yet: the older version keeps running until the person trusts the newer one.
 */
export type PluginUpdateCheck =
  | { readonly kind: "up-to-date" }
  | {
      readonly kind: "available";
      /** The newer version as core read and checked it. */
      readonly manifest: Plugin;
      /** A git plugin's newer commit; a folder plugin has none. */
      readonly toCommit?: string | undefined;
      /** What differs from what was trusted, as the trust check compares it; `undefined` when it can't. */
      readonly changes?: PluginTrustChanges | undefined;
    };

/** The newer version the person saw in the dialog and trusted: what `applyUpdate` may install. */
export interface PluginUpdateApproval {
  readonly version: string;
  /** A git plugin's newer commit; a folder plugin has none. */
  readonly toCommit?: string | undefined;
}

/**
 * What a plugin's page asks the app to do. Each one throws when it can't, with a message for the
 * person; the page says it in a toast.
 */
export interface PluginActions {
  /** **Trust** in the trust check from Review: core's `PluginService.trust`. The feed then says it's on. */
  readonly trust: (plugin: string) => Promise<void>;
  /** **Remove trust**: core's `PluginService.revoke`. The feed then says it isn't trusted. */
  readonly revoke: (plugin: string) => Promise<void>;
  /** **Remove plugin**: core's `PluginService.remove`, with the keychain deleting its secrets. */
  readonly remove: (plugin: string) => Promise<PluginRemoveOutcome>;
  /** The connectors, in any workspace on this computer, whose transport is this plugin. */
  readonly usedBy: (plugin: string) => Promise<readonly PluginUse[]>;
  /**
   * **Check for updates** on a git plugin, **Update from folder** on a folder one: looks at the
   * source again without changing the installed version. It throws when the source can't be read.
   * Left out, with `applyUpdate`, by an app that can't read a plugin's source again yet: the page
   * then has neither button, so nothing on it promises updates (UX check N5b, HAL-9373).
   */
  readonly checkForUpdate?: (plugin: string) => Promise<PluginUpdateCheck>;
  /**
   * **Trust and update**: puts the newer version the person approved in place of the old one and
   * trusts it, as one step. `approved` is what the dialog showed. The app installs only the copy it
   * saved for that version (and commit), and throws if it has none, so a later check can never
   * install a version the person didn't see. It throws when it can't, and then the old version stays.
   * Left out together with `checkForUpdate`.
   */
  readonly applyUpdate?: (plugin: string, approved: PluginUpdateApproval) => Promise<void>;
  /** **Check again**: reads the plugins folder again, so the feed has the plugin as it is now. */
  readonly reload: () => Promise<void>;
  /** Whether this computer can run the plugins' programs (`PluginLocalTools.state()`); the trust check says so. */
  readonly programsRun?: ProgramsRun;
  /** **Open folder**: shows the plugin's folder in the computer's file manager. */
  readonly openFolder: (plugin: string) => Promise<void>;
}

/** The ⋮ button's name (a11y A10). */
export function moreActionsFor(name: string): string {
  return `More actions for ${name}`;
}

/** The ⋮ menu's items (design section 7, F17). */
export const OPEN_FOLDER = "Open folder";
export const REMOVE_TRUST = "Remove trust";
export const REMOVE_PLUGIN_ELLIPSIS = "Remove plugin…";

/** The status box's button and the ⋮'s item: a git plugin looks for a newer commit, a folder one copies again. */
export const CHECK_FOR_UPDATES = "Check for updates";
export const UPDATE_FROM_FOLDER = "Update from folder";
export const CHECKING_FOR_UPDATES = "Checking for updates…";

/** What the button turns into when there is nothing newer, and after **Keep** (T12). */
export function upToDateLine(version: string): string {
  return `Up to date (${version})`;
}

/** The status box's button: the trust check from **Review**, or **Review changes** for a changed plugin. */
export const REVIEW = "Review";
export const REVIEW_CHANGES = "Review changes";

/** The can't-load Callout's first action (T12), and its busy words. */
export const CHECK_AGAIN = "Check again";
export const CHECKING = "Checking…";

/** The Remove dialog (T13, F18). */
export function removeTitle(name: string): string {
  return `Remove ${name}?`;
}
export const REMOVE_PLUGIN = "Remove plugin";
export const REMOVING = "Removing…";

/** The toast after removing (T11). */
export function removedToast(name: string): string {
  return `${name} removed`;
}

/** The toast after **Trust** (T11): the name, then where its command and card are. */
export function onToast(name: string): string {
  return `${name} is on`;
}

/**
 * The toast's body, naming only what the plugin adds: "Its command is in Ctrl K and its card is
 * on Home." Only a command: "Its command is in Ctrl K."; only a card: "Its card is on Home."
 * Several follow the Remove sentence's plural ("Its commands are in Ctrl K"). `undefined` when it
 * adds neither, so the toast is the title alone.
 */
export function onToastBody(manifest: Plugin | undefined): string | undefined {
  const commands = manifest?.ui?.commands.length ?? 0;
  const cards = manifest?.ui?.cards.length ?? 0;
  const parts = [
    commands === 0
      ? undefined
      : `${commands === 1 ? "its command is" : "its commands are"} in Ctrl K`,
    cards === 0 ? undefined : `${cards === 1 ? "its card is" : "its cards are"} on Home`,
  ].filter((part) => part !== undefined);
  if (parts.length === 0) return undefined;
  return `${capitalised(parts.join(" and "))}.`;
}

/** The toast after **Not now** on a plugin that was just added (T11). */
export function addedOffToast(name: string): string {
  return `${name} is added but off`;
}
export const ADDED_OFF_TOAST_BODY = "Nothing from it runs until you trust it.";

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

/**
 * T13's first sentence, naming only what the plugin adds: "Its tools, command, card and panel go
 * away on this computer." A plugin that can't load, so Halonic can't say what it adds: "It goes
 * away from this computer."
 */
export function goesAwayLine(manifest: Plugin | undefined): string {
  const tools =
    (manifest?.backend?.tools.length ?? 0) +
    (manifest?.localTools ?? []).reduce((count, local) => count + local.tools.length, 0);
  const commands = manifest?.ui?.commands.length ?? 0;
  const cards = manifest?.ui?.cards.length ?? 0;
  const parts = [
    named(tools, "tool", "tools"),
    named(commands, "command", "commands"),
    named(cards, "card", "cards"),
    manifest?.ui?.panel === undefined ? undefined : "panel",
  ].filter((part) => part !== undefined);
  if (parts.length === 0) return "It goes away from this computer.";
  return `Its ${list.format(parts)} go away on this computer.`;
}

/**
 * T13's connector sentence: "The *connector* connector in *workspace* stops working until you add
 * the plugin again." Several in one workspace share it ("The *a* and *b* connectors in *w* stop
 * working…"); several workspaces are listed in turn. `""` when no connector uses the plugin.
 */
export function stopsWorkingLine(uses: readonly PluginUse[]): string {
  if (uses.length === 0) return "";
  const byWorkspace = new Map<string, string[]>();
  for (const use of uses) {
    const names = byWorkspace.get(use.workspace) ?? [];
    if (!names.includes(use.connector)) names.push(use.connector);
    byWorkspace.set(use.workspace, names);
  }
  const groups = [...byWorkspace].map(
    ([workspace, names]) =>
      `the ${list.format(names)} ${names.length === 1 ? "connector" : "connectors"} in ${workspace}`,
  );
  const total = [...byWorkspace.values()].reduce((count, names) => count + names.length, 0);
  return `${capitalised(list.format(groups))} ${total === 1 ? "stops" : "stop"} working until you add the plugin again.`;
}

/** Shown in place of the connector sentence when Halonic can't look which connectors use it. */
export const USED_BY_UNKNOWN = "Halonic can't tell yet which connectors use it.";

/** Shown while the connector check is pending: why **Remove plugin** isn't pressable yet. */
export const CHECKING_USED_BY = "Checking which connectors use it…";

/**
 * T13's second sentence, naming only what the plugin keeps (G8): "Its settings, sign-ins and the
 * API key you entered are removed from this computer." `""` when it keeps none of them.
 */
export function removedFromComputerLine(manifest: Plugin | undefined): string {
  const fields = Object.values(manifest?.ui?.settings ?? {});
  const secrets = fields.filter((field) => field.type === "secret").map((field) => field.label);
  const parts = [
    fields.length > secrets.length ? "settings" : undefined,
    (manifest?.backend?.tokens.length ?? 0) > 0 ? "sign-ins" : undefined,
    ...secrets.map((label) => `the ${label} you entered`),
  ].filter((part) => part !== undefined);
  if (parts.length === 0) return "";
  // "Its" goes with settings and sign-ins; a lone secret reads "The API key you entered is…".
  const owned = parts[0] === "settings" || parts[0] === "sign-ins";
  const subject = owned ? `Its ${list.format(parts)}` : capitalised(list.format(parts));
  const verb = parts.length === 1 && !owned ? "is" : "are";
  return `${subject} ${verb} removed from this computer.`;
}

/**
 * Why removing stopped, in the dialog's error slot: which secret, and the keychain's message.
 * Pressing **Remove plugin** again finishes the job.
 */
export function removeFailedLine(name: string, secret: string, reason: string): string {
  return `Couldn't remove ${name}: its secret ${secret} couldn't be deleted. ${sentence(reason)}`;
}

/** An action that failed, in a toast's title (microcopy 1.1): "Couldn't remove trust: *reason*." */
export function actionFailedLine(action: string, reason: string): string {
  return `Couldn't ${action}: ${afterColon(reason)}.`;
}

/** A host's message after a colon ({@link lowerAfterColon}), with no closing full stop. */
function afterColon(reason: string): string {
  return lowerAfterColon(reason.trim().replace(/\.$/, ""));
}

/** What each action is called in `actionFailedLine`. */
export const ACTION_WORDS = {
  revoke: "remove trust",
  checkForUpdates: "check for updates",
  updateFromFolder: "update from folder",
  reload: "check again",
  openFolder: "open the folder",
  remove: "remove the plugin",
} as const;

function named(count: number, one: string, many: string): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? one : many;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sentence(text: string): string {
  const trimmed = capitalised(text.trim());
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
