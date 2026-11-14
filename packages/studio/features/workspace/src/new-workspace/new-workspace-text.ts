/** The words of the New workspace dialog (flow-workspace 2.3, microcopy 4.1). */
export const NEW_WORKSPACE_TITLE = "New workspace";
export const NEW_WORKSPACE_MENU_ROW = "New workspace…";
export const NAME_FIELD = "Name";
export const FOLDER_FIELD = "Folder";
export const CHANGE_FOLDER = "Change…";
export const GIVE_IT_A_NAME = "Give it a name.";
export const CHOOSE_A_FOLDER = "Choose a folder.";
export const LOCAL_ONLY_NOTE =
  "Starts local only, with a model on this computer (Ollama). You can add cloud models later.";
export const NOT_EMPTY_NOTE =
  "This folder isn't empty. Halonic adds only missing files, and adds .env lines to a .gitignore that lacks them. Nothing else changes.";
export const ALREADY_WORKSPACE_NOTE = "This folder is already a workspace.";
export const CREATE = "Create";
export const CREATE_HERE = "Create here";
export const OPEN_IT = "Open it";
export const CREATING = "Creating…";
export const OPENING = "Opening…";

/** "Can't write to this folder: you don't have permission." */
export function cantWriteLine(reason: string): string {
  return `Can't write to this folder: ${reason.replace(/\.$/, "")}.`;
}

/** "Can't open Acme: the folder isn't there any more." */
export function cantOpenLine(folder: string, reason: string): string {
  return `Can't open ${folder}: ${reason.replace(/\.$/, "")}.`;
}

/** A name problem under **Name**: "The name is empty." */
export function nameProblemLine(reason: string): string {
  const sentence = reason.replace(/\.$/, "");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** The toast after a workspace was created; the trust record's failure, when it failed, follows. */
export function createdLine(name: string, trustFailure?: string): string {
  return trustFailure === undefined
    ? `Created ${name}`
    : `Created ${name}. Couldn't save trust: ${trustFailure.replace(/\.$/, "")}.`;
}
