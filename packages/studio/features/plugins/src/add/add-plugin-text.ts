// The words of the Add plugin dialog, from the plugin screens design section 4 and microcopy 24
// T5 (HAL-1739, HAL-751). Names, paths and messages from a plugin or the computer are only ever
// a value in these lines.

import type { PluginLoadProblem } from "../page/plugin-pages.ts";

export const ADD_PLUGIN = "Add plugin";
export const ADDING = "Getting the plugin…";
export const TRY_AGAIN = "Try again";

export const SOURCE_LABEL = "Where it comes from";
export const FOLDER_OPTION = "A folder on this computer";
export const GIT_OPTION = "A git repository";
export const FOLDER_FIELD = "Folder";
export const CHOOSE_FOLDER = "Choose folder…";
export const ADDRESS_FIELD = "Address";
export const REF_FIELD = "Branch, tag or version (optional)";
export const REF_HINT = "Halonic keeps this exact version until you update it.";

/** The line under the choices. */
export const NOTE_LINE =
  "Halonic copies it into your plugins folder. Nothing runs until you've checked what it can do.";

/** The field's error when Add is pressed with it empty (T5). */
export const ENTER_SOURCE = "Enter a folder or a git address.";

export const NO_MANIFEST = "That folder has no plugin.yaml.";

/** The busy button's words: "Getting halonic-weather…". */
export function gettingLine(name: string): string {
  return name === "" ? ADDING : `Getting ${name}…`;
}

/** The name a source goes by while it is copied: its last folder, or its repository's name. */
export function sourceName(source: { readonly kind: "folder" | "git"; readonly text: string }) {
  const trimmed = source.text.trim().replace(/[\\/]+$/, "");
  const last = trimmed.split(/[\\/:]/).pop() ?? "";
  return source.kind === "git" ? last.replace(/\.git$/, "") : last;
}

/** T5: "Can't add *name*. Its plugin.yaml has 2 problems. Nothing was installed." */
export function brokenLine(name: string, count: number): string {
  const problems = count === 1 ? "1 problem" : `${count} problems`;
  return `Can't add ${name}. Its plugin.yaml has ${problems}. Nothing was installed.`;
}

/** T5: "Couldn't reach github.com: you're offline." */
export function offlineLine(host: string): string {
  return `Couldn't reach ${host}: you're offline.`;
}

/** T5: "A plugin called weather is already installed. Update it from its page." */
export function takenLine(id: string): string {
  return `A plugin called ${id} is already installed. Update it from its page.`;
}

/** The button beside it: "Open Weather". */
export function openLine(name: string): string {
  return `Open ${name}`;
}

/** Why adding stopped for a reason Halonic has no words for: "Couldn't add *name*: *reason*." */
export function failedLine(name: string, reason: string): string {
  const trimmed = reason.trim().replace(/\.$/, "");
  return `Couldn't add ${name === "" ? "the plugin" : name}: ${trimmed}. Nothing was installed.`;
}

/** "plugin.yaml ui.commands.0.tool", or just the file, or `""` for the folder itself. */
export function problemPlace(problem: PluginLoadProblem): string {
  return [problem.file, problem.path.map(String).join(".")].filter((part) => part !== "").join(" ");
}
