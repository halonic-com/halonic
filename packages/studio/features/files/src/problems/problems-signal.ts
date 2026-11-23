import {
  FilesWithErrorsService,
  filesWithErrorsReading,
  type PlaceSignal,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { problemsWords } from "./problems-words.ts";

/**
 * The count after Home's Problems heading, "Problems · 6 files", from the list the status bar
 * reads, or `undefined` before its first read and at zero.
 */
export function problemsSignal(context: WorkspaceContext): PlaceSignal | undefined {
  const source = context.services.find(FilesWithErrorsService);
  const files = source === undefined ? 0 : (filesWithErrorsReading(source).current()?.length ?? 0);
  return files === 0
    ? undefined
    : { mark: "count", value: files, spoken: problemsWords.homeCount(files) };
}

/** Calls `listener` after each new read of the list; returns the way to stop. */
export function subscribeProblems(context: WorkspaceContext, listener: () => void): () => void {
  const source = context.services.find(FilesWithErrorsService);
  return source === undefined ? () => {} : filesWithErrorsReading(source).subscribe(listener);
}
