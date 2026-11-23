import type { FileWithErrorsKind } from "@halonicjs/studio-shell";

/** The words of the workspace's problem count (C348 on HAL-14317, option A). */
export const problemsWords = {
  /** The count in the status bar and the phone strip, and the phone sheet's title. */
  count: (files: number): string =>
    files === 1 ? "1 file with a problem" : `${files} files with problems`,
  show: "Show",
  /** The menu's and the sheet's line over the files. */
  description: "Each opens its file at the first problem.",
  /** An entry's second line: where its first problem is, and why. */
  line: (line: number, reason: string): string => `Line ${line}: ${reason}`,
  /** Home's section: its name, read with the count after it, "Problems, 6 files" (C348 A6). */
  homeTitle: "Problems",
  homeCount: (files: number): string => (files === 1 ? "1 file" : `${files} files`),
  /** Under Home's first five files, opening the status bar's list. */
  showAll: (files: number): string => `Show all ${files} files`,
  /** A Home row's chip: how many errors its file has. */
  problems: (errors: number): string => (errors === 1 ? "1 problem" : `${errors} problems`),
  /** Said once when a save or a change makes the count go away (C348 A4). */
  none: "No files with problems",
  kinds: {
    agent: "Agent",
    workflow: "Workflow",
    routine: "Routine",
    connector: "Connector",
  } satisfies Record<FileWithErrorsKind, string>,
} as const;
