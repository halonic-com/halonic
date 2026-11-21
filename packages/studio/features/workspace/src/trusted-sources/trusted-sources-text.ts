import { trustedOn } from "../trust/trust-section-text.ts";

/** The words of Settings › Trusted sources (flow-workspace 7, flow-settings 8, microcopy 4.6). */
export const SECTION_TITLE = "Trusted sources";
/** Only workspaces and plugins write trust records (HAL-12642). */
export const LEAD = "Workspaces and plugins you've trusted on this computer.";
export const LEAD_SERVED = "Workspaces and plugins you've trusted on the computer running Halonic.";
export const VIEW_ONLY = "View only here.";
export const EMPTY = "Nothing trusted yet.";
/** The note about the command line, in three parts so the command is shown as code: Studio reads the CLI's trust store. */
export const CLI_NOTE = ["Trust given with the ", "halonic", " command shows here too."] as const;
export const LOADING = "Loading trusted sources";
export const REMOVE = "Remove";
export const REMOVE_TRUST = "Remove trust";
export const REMOVING = "Removing…";
/** What removing trust stops, for a workspace and for a plugin (C52 7.2, HAL-13678). */
export const REMOVE_BODY =
  "Halonic will ask again before running anything from this workspace, and runs in progress stop.";
export const REMOVE_PLUGIN_BODY = "Its tools won't run until you trust it again.";
export const FOLDER_NOT_FOUND = "Folder not found";
/** A plugin row whose trust is gone but whose sign-out failed (C544-1, HAL-15116). */
export const NOT_SIGNED_OUT = "Trust removed, not signed out";
/** What a row trusts, beside its name, so plugin and workspace rows differ (C544). */
export const KIND = { plugin: "Plugin", workspace: "Workspace" } as const;
export const LOAD_FAILED = "Couldn't load trusted sources";
export const TRY_AGAIN = "Try again";

export { trustedOn };
export const removeTitle = (name: string) => `Remove trust from ${name}?`;
/** The rest of a row's **Remove** for screen readers, so each row's button has its own name. */
export const removeSpoken = (name: string) => ` trust from ${name}`;
/** A plugin is signed out before its record goes, so its line says so (C544-1). */
export const removedLine = (name: string, kind: "plugin" | "workspace") =>
  kind === "plugin" ? `Removed trust from ${name} and signed it out` : `Removed trust from ${name}`;
export const removeFailed = (name: string, reason: string) =>
  `Couldn't remove trust from ${name}: ${reason}.`;
/** The record is gone but the plugin's sign-ins are left; removing again tries the sign-out again. */
export const signOutFailed = (name: string, reason: string) =>
  `Removed trust from ${name}, but couldn't sign it out: ${reason}. Remove trust again to try the sign-out again.`;
