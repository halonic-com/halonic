import { trustDay } from "../trust/trust-section-text.ts";

/** The words of Settings › Trusted sources (flow-workspace 7, flow-settings 8, microcopy 4.6). */
export const SECTION_TITLE = "Trusted sources";
export const LEAD = "Workspaces, hubs and skills you've trusted on this computer.";
export const LEAD_SERVED =
  "Workspaces, hubs and skills you've trusted on the computer running Halonic.";
export const VIEW_ONLY = "View only here.";
export const EMPTY =
  "Nothing trusted yet. Halonic asks before running anything from a workspace, skill or connector you didn't create in Halonic.";
export const CLI_NOTE = "Trust given with the `halonic` command is kept separately.";
export const REMOVE = "Remove";
export const REMOVE_TRUST = "Remove trust";
export const REMOVING = "Removing…";
export const REMOVE_BODY = "Halonic will ask again before running anything from this source.";
export const FOLDER_NOT_FOUND = "Folder not found";
export const LOAD_FAILED = "Couldn't load trusted sources";
export const TRY_AGAIN = "Try again";

export const trustedOn = (iso: string) => `Trusted ${trustDay(iso, false)}`;
export const removeTitle = (name: string) => `Remove trust from ${name}?`;
export const removedLine = (name: string) => `Removed trust from ${name}`;
export const removeFailed = (name: string, reason: string) =>
  `Couldn't remove trust from ${name}: ${reason}.`;
