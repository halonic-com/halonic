// What a plugin's page does through the app, and its words: the ⋮ menu, Remove trust, Remove
// plugin… and the can't-load actions (plugin screens design section 7, microcopy 24 T12 and T13,
// UX acceptance checklist 6.2 and 6.5, fallbacks G4 and G8). The plugin's name, labels and
// titles are only ever a value in these lines.

import type { Plugin } from "@halonicjs/format";

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
  /** **Check again**: reads the plugins folder again, so the feed has the plugin as it is now. */
  readonly reload: () => Promise<void>;
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

/** Shown in place of the connector sentence when Halonic couldn't look which connectors use it. */
export const USED_BY_UNKNOWN = "Halonic couldn't check which connectors use it.";

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

/**
 * A host's message after a colon: no closing full stop, and a capital that only starts the
 * sentence lower-cased ("The disk is full." is "the disk is full"), so a name keeps its capital.
 */
function afterColon(reason: string): string {
  const trimmed = reason.trim().replace(/\.$/, "");
  return /^\p{Lu}\p{Ll}/u.test(trimmed) && !/^\S+\p{Lu}/u.test(trimmed)
    ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
    : trimmed;
}

/** What each action is called in `actionFailedLine`. */
export const ACTION_WORDS = {
  revoke: "remove trust",
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
