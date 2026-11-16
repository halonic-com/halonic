import { type CodeEditor, languageFor, openCodeEditor } from "@halonicjs/studio-code-editor";
import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { fileName } from "../file-item.ts";
import { FilesHostService } from "../files-host.ts";
import { filesWords } from "../files-words.ts";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "missing" }
  | { readonly kind: "ready"; readonly text: string };

/**
 * A file in its tab: the file's name over the code editor. Typing goes straight to the
 * workspace's files, which save a moment later, so the tab has no Save button and no unsaved dot
 * (requirement `files.ui.file-tab`).
 */
export function FileView({ item, context }: ItemViewProps) {
  const host = context.services.get(FilesHostService);
  const path = item.id;
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    setLoaded({ kind: "loading" });
    host.read(path).then(
      (text) => {
        if (stopped) return;
        setLoaded(text === null ? { kind: "missing" } : { kind: "ready", text });
      },
      (error: unknown) => {
        if (stopped) return;
        setLoaded({
          kind: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      stopped = true;
    };
  }, [host, path]);

  const ready = loaded.kind === "ready";
  useEffect(() => {
    const container = parent.current;
    if (!ready || container === null) return;
    // The text is read once; the editor owns it from here, so typing is never overwritten.
    const text = loaded.kind === "ready" ? loaded.text : "";
    let editor: CodeEditor | undefined;
    let stopped = false;
    void openCodeEditor({
      parent: container,
      text,
      language: languageFor(path),
      label: filesWords.editorLabel(path),
      onChange: (next) => host.edit(path, next),
    }).then((made) => {
      if (stopped) made.destroy();
      else editor = made;
    });
    return () => {
      stopped = true;
      editor?.destroy();
    };
  }, [ready, host, path]);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={fileName(path)}>
      <h1 className="truncate px-4 py-2 text-base font-medium" title={path}>
        {fileName(path)}
      </h1>
      {loaded.kind === "loading" && (
        <div role="status" aria-label={filesWords.fileLoading} className="grid gap-3 p-4">
          <SkeletonBar kind="title" width="2/3" />
          <SkeletonBar kind="title" width="1/2" />
        </div>
      )}
      {loaded.kind === "missing" && (
        <EmptyState
          plain
          title={filesWords.missingTitle}
          description={filesWords.missingDescription}
        />
      )}
      {loaded.kind === "error" && (
        <EmptyState
          tone="error"
          plain
          title={filesWords.unreadableTitle}
          description={loaded.reason}
        />
      )}
      {ready && <div ref={parent} className="min-h-0 flex-1 overflow-hidden" />}
    </section>
  );
}
