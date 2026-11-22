import type { CodeEditor } from "@halonicjs/studio-code-editor";
import type { FilesHost } from "../files-host.ts";

/** What {@link followFileText} reads, loads and counts. */
export interface FollowFileTextParts {
  readonly host: Pick<FilesHost, "read" | "subscribe">;
  readonly path: string;
  readonly editor: Pick<CodeEditor, "text" | "load">;
  /** How many changes the person has made in the editor; it only goes up. */
  readonly edits: { readonly current: number };
  /** Hears each text loaded into the editor. */
  readonly loaded: (text: string) => void;
}

/**
 * Loads into the editor each change to the file the editor didn't make (the workspace's Undo, a
 * rename, another feature), read again when the host says something changed. A read that started
 * before the person's latest change, or before a newer read, holds older text and is dropped, so
 * it never replaces what the person typed meanwhile, which the next autosave would then write.
 *
 * @returns stops following
 */
export function followFileText({
  host,
  path,
  editor,
  edits,
  loaded,
}: FollowFileTextParts): () => void {
  let stopped = false;
  let newest = 0;
  const unsubscribe = host.subscribe(() => {
    const turn = ++newest;
    const editsAtStart = edits.current;
    host.read(path).then(
      (latest) => {
        if (stopped || turn !== newest || edits.current !== editsAtStart) return;
        if (latest === null || latest === editor.text()) return;
        loaded(latest);
        editor.load(latest);
      },
      // A failed read loads nothing; the strips and the next change say what's wrong.
      () => {},
    );
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}
