import { type CodeEditor, languageFor, openCodeEditor } from "@halonicjs/studio-code-editor";
import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { fileItem, fileName } from "../file-item.ts";
import { sizeOf, textKindOf } from "../file-size.ts";
import { type FileIssue, FilesHostService, type OutsideChange } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import {
  causedElsewhere,
  type Elsewhere,
  problemsElsewhere,
  withNewSince,
} from "../problems-elsewhere.ts";
import { CompareView } from "./compare-view.tsx";
import { OutsideStrip } from "./outside-strip.tsx";
import { ProblemsPanel } from "./problems-panel.tsx";

/** How long after the last change the problems are checked again, in milliseconds. */
export const recheckDelayMs = 300;

const noElsewhere: Elsewhere = { count: 0, firstFile: undefined };

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "missing" }
  | { readonly kind: "not-text"; readonly size: string }
  | { readonly kind: "ready"; readonly text: string; readonly readOnly: boolean };

/** What a file's text shows as: the editor, the editor read-only, or a note that it isn't text. */
function loadedOf(text: string | null): Loaded {
  if (text === null) return { kind: "missing" };
  const kind = textKindOf(text);
  if (kind === "not-text") return { kind: "not-text", size: sizeOf(text) };
  return { kind: "ready", text, readOnly: kind === "large" };
}

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
  // Bumped when Compare changed the file, so the text is read again.
  const [round, setRound] = useState(0);
  const [comparing, setComparing] = useState(false);
  // Why a choice made in the strip couldn't be saved; Compare opens with it.
  const [failure, setFailure] = useState<string | undefined>();
  // Set when the user chose in the strip or in Compare: the reopened editor takes focus.
  const refocus = useRef(false);
  const [outside, setOutside] = useState<OutsideChange | undefined>(() => host.outside().get(path));

  const editorRef = useRef<CodeEditor | undefined>(undefined);
  // The editor is made once for a file, so it reads the announcer through a ref, not a dependency.
  const announcer = useRef(context.announcer);
  announcer.current = context.announcer;
  const [problems, setProblems] = useState<readonly FileIssue[]>([]);
  const problemsRef = useRef<readonly FileIssue[]>([]);
  const [elsewhere, setElsewhere] = useState<Elsewhere>(noElsewhere);
  // Set when this tab's editor changes the text, cleared by the next check: a problem that shows
  // up in another file without it did not come from this tab.
  const editedSince = useRef(false);
  const [reveal, setReveal] = useState<{ line: number; round: number } | undefined>();

  // The problems are checked when the tab opens and again a moment after the files change, so
  // typing never waits for the check. The first check is what other files looked like before
  // this tab's changes; later ones are compared with it. A check that follows no edit here moves
  // that baseline on, so another file's change is never blamed on this tab.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let before: ReadonlyMap<string, number> | undefined;
    let last: ReadonlyMap<string, number> = new Map();
    let newest = 0;
    editedSince.current = false;
    problemsRef.current = [];
    setProblems([]);
    setElsewhere(noElsewhere);
    const check = () => {
      const turn = ++newest;
      host.problems().then(
        (all) => {
          if (stopped || turn !== newest) return;
          const now = problemsElsewhere(path, all);
          if (before === undefined) before = now;
          else if (!editedSince.current) before = withNewSince(before, last, now);
          last = now;
          editedSince.current = false;
          const own = all.filter((issue) => issue.file === path);
          problemsRef.current = own;
          setProblems(own);
          setElsewhere(causedElsewhere(path, before, all));
          editorRef.current?.setProblems(own);
        },
        () => {},
      );
    };
    check();
    const unsubscribe = host.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(check, recheckDelayMs);
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [host, path]);

  useEffect(() => {
    setOutside(host.outside().get(path));
    return host.subscribe(() => setOutside(host.outside().get(path)));
  }, [host, path]);

  useEffect(() => {
    let stopped = false;
    setLoaded({ kind: "loading" });
    host.read(path).then(
      (text) => {
        if (stopped) return;
        setLoaded(loadedOf(text));
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
  }, [host, path, round]);

  const ready = loaded.kind === "ready";
  const editing = ready && !comparing;
  useEffect(() => {
    const container = parent.current;
    if (!editing || container === null) return;
    // The editor starts from this text. Later changes the editor didn't make (the workspace's
    // Undo, a rename, another feature) come through the host and are loaded below.
    const text = loaded.kind === "ready" ? loaded.text : "";
    const readOnly = loaded.kind === "ready" && loaded.readOnly;
    let editor: CodeEditor | undefined;
    let stopped = false;
    const follow = (made: CodeEditor) =>
      host.subscribe(() => {
        host.read(path).then(
          (latest) => {
            if (!stopped && latest !== null && latest !== made.text()) made.load(latest);
          },
          () => {},
        );
      });
    let unsubscribe = () => {};
    void openCodeEditor({
      parent: container,
      text,
      language: languageFor(path),
      label: filesWords.editorLabel(path),
      readOnly,
      onChange: (next) => {
        editedSince.current = true;
        host.edit(path, next);
      },
      onProblemJump: (problem) =>
        announcer.current.announce(
          filesWords.problemRead(problem.severity, problem.line, problem.message),
        ),
      onProblemMarkClick: (line) => setReveal((was) => ({ line, round: (was?.round ?? 0) + 1 })),
    }).then((made) => {
      if (stopped) made.destroy();
      else {
        editor = made;
        editorRef.current = made;
        made.setProblems(problemsRef.current);
        unsubscribe = follow(made);
        if (refocus.current) {
          refocus.current = false;
          made.focus();
        }
      }
    });
    return () => {
      stopped = true;
      unsubscribe();
      editorRef.current = undefined;
      editor?.destroy();
    };
  }, [editing, host, path]);

  /** Reads the text again, and shows no editor until it has: the old text would be stale. */
  function reload(): void {
    setLoaded({ kind: "loading" });
    setRound((n) => n + 1);
  }

  /** The strip's own choices; a failed one leaves the strip as it was, and Compare shows the reason. */
  async function settleWith(choice: "keep-mine" | "use-other"): Promise<void> {
    try {
      await host.settle(path, choice);
      refocus.current = true;
      setOutside(host.outside().get(path));
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setComparing(true);
    }
  }

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
      {loaded.kind === "not-text" && (
        <EmptyState
          plain
          title={filesWords.notTextTitle}
          description={filesWords.notTextDescription(loaded.size)}
        />
      )}
      {loaded.kind === "ready" && loaded.readOnly && (
        <div
          role="status"
          className="border-b border-border bg-surface-muted px-4 py-1 text-small text-fg"
        >
          {filesWords.largeFile}
        </div>
      )}
      {loaded.kind === "error" && (
        <EmptyState
          tone="error"
          plain
          title={filesWords.unreadableTitle}
          description={loaded.reason}
        />
      )}
      {outside !== undefined && !comparing && (
        <OutsideStrip
          path={path}
          change={outside}
          onCompare={() => setComparing(true)}
          onKeepMine={() => settleWith("keep-mine")}
          onLoadTheirs={() => settleWith("use-other")}
          onClose={() => settleWith("use-other")}
        />
      )}
      {comparing && (
        <CompareView
          path={path}
          context={context}
          initialFailure={failure}
          // The editor was closed while comparing, so it reopens from what the files hold now,
          // which includes what was typed before Compare.
          onCancel={() => {
            setComparing(false);
            setFailure(undefined);
            reload();
          }}
          onDone={() => {
            refocus.current = true;
            setComparing(false);
            setFailure(undefined);
            setOutside(host.outside().get(path));
            reload();
          }}
        />
      )}
      {editing && <div ref={parent} className="min-h-0 flex-1 overflow-hidden" />}
      {editing && (
        <ProblemsPanel
          problems={problems}
          elsewhere={elsewhere}
          reveal={reveal}
          onGo={(issue) => editorRef.current?.goTo(issue.line, issue.col)}
          onOpenFile={(other) => context.openItem?.(fileItem(other))}
        />
      )}
    </section>
  );
}
