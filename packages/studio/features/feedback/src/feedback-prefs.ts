import { type HostSetting, hostSetting } from "@halonicjs/app";
import { defaultShortcut } from "./settings/shortcut-keys.ts";

/** The longest project or assignee name kept; Paperclip's names are far shorter. */
export const maxNameLength = 80;

function isName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= maxNameLength;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Where feedback goes and the shortcut that starts it, kept on the computer for every workspace
 * (`feedback.settings-section`). The Send feedback window reads the project and the assignee; only
 * the shell saves the shortcut (`plugin:feedback|shortcut_set`), so Settings reads it here and
 * never sets it.
 */
export const feedbackPrefs = {
  /** The Paperclip project a feedback task goes to, by name. */
  project: hostSetting("feedback.project", "Halonic apps", isName),
  /** Who a feedback task is assigned to, by name. */
  assignee: hostSetting("feedback.assignee", "Chief", isName),
  /** The shortcut as the shell saved it, such as `"control+alt+KeyK"`. */
  shortcut: hostSetting("feedback.shortcut", defaultShortcut, isText),
} satisfies Readonly<Record<string, HostSetting<string>>>;
