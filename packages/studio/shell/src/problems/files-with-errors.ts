import { type ServiceKey, serviceKey } from "../service-key.ts";

/** The kinds of file the workspace's problem lists show, in the order they list them. */
export const fileWithErrorsKinds = ["agent", "workflow", "routine", "connector"] as const;

/** One of {@link fileWithErrorsKinds}. */
export type FileWithErrorsKind = (typeof fileWithErrorsKinds)[number];

/**
 * One file of the open workspace in which the shared check finds at least one error. Warnings
 * don't count, by the same rule as the Start run card: a warning doesn't stop a run (C348).
 */
export interface FileWithErrors {
  /** The file's path from the workspace folder, such as `hubs/support/agents/writer.agent.yaml`. */
  readonly path: string;
  readonly kind: FileWithErrorsKind;
  /** The hub folder the file sits in, or `null` at the workspace root (a shared connector). */
  readonly hub: string | null;
  /** The id its place gives: the `<id>` of its file name, as `writer` for `writer.agent.yaml`. */
  readonly id: string;
  /** The file's own `name` when it can still be read, else its file name: "writer.agent.yaml". */
  readonly name: string;
  /**
   * Whether the file loaded. A file that didn't has no page to open, so its list shows it as a
   * broken row; one that loaded has its normal row, and its errors come from other files.
   */
  readonly loaded: boolean;
  /** The file's first error, by line: where the file opens, and the reason its row shows. */
  readonly firstError: { readonly line: number; readonly col: number; readonly reason: string };
  /** How many errors the file has, for its row's "3 problems". */
  readonly errors: number;
}

/**
 * The files with errors of the open workspace, from the same check as Files › Problems, with
 * unsaved changes applied. The status bar, Home and the lists read this one list, so they never
 * disagree about a file.
 */
export interface FilesWithErrorsSource {
  /**
   * The files, in the order the problem lists show them: the files that didn't load first, since
   * their errors are the causes of other files' errors, then the files that did; within each,
   * agents, workflows, routines and connectors, each by name. Rejects when the workspace can't
   * be read.
   */
  list(): Promise<readonly FileWithErrors[]>;
  /** Calls `listener` after every change of the workspace's files and every save; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/** The app gives {@link FilesWithErrorsSource} for each open workspace (`studio.files-with-errors`). */
export const FilesWithErrorsService: ServiceKey<FilesWithErrorsSource> =
  serviceKey<FilesWithErrorsSource>("studio.files-with-errors");
