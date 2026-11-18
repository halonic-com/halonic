import { type CodeEditor, languageFor, openCodeEditor } from "@halonicjs/studio-code-editor";
import { Callout, EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import { errorReasonFor, type ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fileItem, fileName } from "../file-item.ts";
import { sizeOf, textKindOf } from "../file-size.ts";
import {
  type CompareChoice,
  type FileIssue,
  FilesHostService,
  type OutsideChange,
} from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import { takeFocusOnOpen } from "../focus-on-open.ts";
import {
  causedElsewhere,
  type Elsewhere,
  problemsElsewhere,
  withNewSince,
} from "../problems-elsewhere.ts";
import { subscribeTrashed, type Trashed, trashedFile } from "../trash.ts";
import { CompareView } from "./compare-view.tsx";
import { OutsideStrip } from "./outside-strip.tsx";
import { ProblemsPanel } from "./problems-panel.tsx";
import { TrashedStrip } from "./trashed-strip.tsx";
import { useFileGone } from "./use-file-gone.ts";

/** How long after the last change the problems are checked again, in milliseconds. */
export const recheckDelayMs = 300;

const noElsewhere: Elsewhere = { count: 0, firstFile: undefined };

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "missing" }
  | { readonly kind: "not-text"; readonly size: string }
  | { readonly kind: "ready"; readonly text: string; readonly readOnly: boolean };

/** The language's name as the editor's label says it. */
const languageNames = { yaml: "YAML", markdown: "Markdown", plain: "text" } as const;

/** What a file's text shows as: the editor, the editor read-only, or a note that it isn't text. */
function loadedOf(text: string | null): Loaded {
  if (text === null) return { kind: "missing" };
  const kind = textKindOf(text);
  if (kind === "not-text") return { kind: "not-text", size: sizeOf(text) };
  return { kind: "ready", text, readOnly: kind === "large" };
}

/** Moves focus to the Files tree's Tab stop, where the user picks another file. */
function goToFiles(): void {
  document
    .querySelector<HTMLElement>('[role="tree"][aria-label="Files"] [data-path][tabindex="0"]')
    ?.focus();
}

/** The strip that shows above the editor: only the first of those that apply. */
function stripShown(applies: {
  readonly unreadable: boolean;
  readonly trashed: boolean;
  readonly outside: boolean;
}): "unreadable" | "trash" | "outside" | undefined {
  if (applies.unreadable) return "unreadable";
  if (applies.trashed) return "trash";
  return applies.outside ? "outside" : undefined;
}

/**
 * What stands in for the editor while the file loads, is gone, isn't text, or can't be read. A
 * file that can't be read offers **Try again**, which reads it again in the same tab.
 */
function LoadNotice({
  loaded,
  missing,
  onRetry,
}: {
  loaded: Loaded;
  missing: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      {loaded.kind === "loading" && (
        <div role="status" aria-label={filesWords.fileLoading} className="grid gap-3 p-4">
          <SkeletonBar kind="title" width="2/3" />
          <SkeletonBar kind="title" width="1/2" />
        </div>
      )}
      {missing && (
        <EmptyState
          plain
          title={filesWords.missingTitle}
          action={{ label: filesWords.goToFiles, onClick: goToFiles }}
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
          action={{ label: filesWords.tryAgain, onClick: onRetry }}
        />
      )}
    </>
  );
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
  // The last text the tab held, so the editor can open again greyed when the file goes to the trash.
  const lastText = useRef<string | undefined>(undefined);
  // The way to put the file back, while a delete in this window has it in the trash.
  const trash: Trashed | undefined = useSyncExternalStore(subscribeTrashed, () =>
    trashedFile(path),
  );
  // The choice just made, said in a line above the editor until the next edit.
  const [settled, setSettled] = useState<CompareChoice | undefined>();
  const [outside, setOutside] = useState<OutsideChange | undefined>(() => host.outside().get(path));

  const editorRef = useRef<CodeEditor | undefined>(undefined);
  // The editor is made once for a file, so it reads the announcer through a ref, not a dependency.
  const announcer = useRef(context.announcer);
  announcer.current = context.announcer;
  const [problems, setProblems] = useState<readonly FileIssue[]>([]);
  const problemsRef = useRef<readonly FileIssue[]>([]);
  const [elsewhere, setElsewhere] = useState<Elsewhere>(noElsewhere);
  // The line where a YAML file stopped being valid YAML, from the same check as the problems.
  const [syntaxLine, setSyntaxLine] = useState<number | null>(null);
  // Counts the changes this tab's editor makes. A check compares the count at its start with the
  // count at the last check that was used: a problem that shows up in another file without an edit
  // in between did not come from this tab.
  const edits = useRef(0);
  const [reveal, setReveal] = useState<{ line: number; round: number } | undefined>();

  // The problems are checked when the tab opens and again a moment after the files change, so
  // typing never waits for the check. The first check is what other files looked like before
  // this tab's changes; later ones are compared with it. A check that follows no edit here moves
  // that baseline on, so another file's change is never blamed on this tab. The same check
  // finds out whether a YAML file can still be read.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let before: ReadonlyMap<string, number> | undefined;
    let last: ReadonlyMap<string, number> = new Map();
    let newest = 0;
    let editsAtLast = edits.current;
    problemsRef.current = [];
    setProblems([]);
    setElsewhere(noElsewhere);
    setSyntaxLine(null);
    const check = () => {
      const turn = ++newest;
      // Read at the start: an edit made while the check runs belongs to the next check.
      const editsAtStart = edits.current;
      Promise.all([host.problems(), host.yamlSyntaxLine(path).catch(() => null)]).then(
        ([all, line]) => {
          if (stopped || turn !== newest) return;
          setSyntaxLine(line);
          const now = problemsElsewhere(path, all);
          if (before === undefined) before = now;
          else if (editsAtStart === editsAtLast) before = withNewSince(before, last, now);
          last = now;
          editsAtLast = editsAtStart;
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
        lastText.current = text ?? undefined;
        setLoaded(loadedOf(text));
      },
      (error: unknown) => {
        if (stopped) return;
        // Only a kinded error's own sentence shows; anything else says Halonic can't explain it (F13).
        setLoaded({ kind: "error", reason: errorReasonFor(error) });
      },
    );
    return () => {
      stopped = true;
    };
  }, [host, path, round]);

  const ready = loaded.kind === "ready";
  const gone = useFileGone(host, path, ready, trash !== undefined, () => {
    // Back (Undo, or a restore elsewhere): the editor opens again on what the file holds now.
    refocus.current = true;
    reload();
  });

  // Read-only from the moment the file goes to the trash, before any read has said it is gone.
  const trashedHere = ready && trash !== undefined;
  const missing = loaded.kind === "missing" || (ready && gone && trash === undefined);
  const editing = ready && !comparing && !missing;
  // One strip at a time above the editor, by what the user can still do: can't be read, trash,
  // changed or deleted outside (design-ahead states DA6).
  const strip = stripShown({
    unreadable: editing && syntaxLine !== null,
    trashed: trashedHere,
    outside: outside !== undefined && !comparing,
  });
  useEffect(() => {
    const container = parent.current;
    if (!editing || container === null) return;
    // The editor starts from this text. Later changes the editor didn't make (the workspace's
    // Undo, a rename, another feature) come through the host and are loaded below.
    const text = lastText.current ?? (loaded.kind === "ready" ? loaded.text : "");
    const readOnly = trashedHere || (loaded.kind === "ready" && loaded.readOnly);
    let editor: CodeEditor | undefined;
    let stopped = false;
    const follow = (made: CodeEditor) =>
      host.subscribe(() => {
        host.read(path).then(
          (latest) => {
            if (!stopped && latest !== null && latest !== made.text()) {
              lastText.current = latest;
              made.load(latest);
            }
          },
          () => {},
        );
      });
    let unsubscribe = () => {};
    void openCodeEditor({
      parent: container,
      text,
      language: languageFor(path),
      label: filesWords.editorLabel(fileName(path), languageNames[languageFor(path)]),
      readOnly,
      onChange: (next) => {
        lastText.current = next;
        edits.current += 1;
        setSettled(undefined);
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
        // A file the user just made opens with the cursor in the editor (files flow 8.10).
        const justMade = takeFocusOnOpen(path);
        if (refocus.current || justMade) {
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
  }, [editing, trashedHere, host, path]);

  /** Reads the text again, and shows no editor until it has: the old text would be stale. */
  function reload(): void {
    setLoaded({ kind: "loading" });
    setRound((n) => n + 1);
  }

  /** Shows and announces the line for a choice that was made. */
  function said(choice: CompareChoice): void {
    setSettled(choice);
    context.announcer.announce(`${filesWords.settled[choice]}.`);
  }

  /** The strip's own choices; a failed one leaves the strip as it was, and Compare shows the reason. */
  async function settleWith(choice: "keep-mine" | "use-other"): Promise<void> {
    try {
      await host.settle(path, choice);
      said(choice);
      refocus.current = true;
      setOutside(host.outside().get(path));
      reload();
    } catch (error) {
      setFailure(errorReasonFor(error));
      setComparing(true);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={fileName(path)}>
      <h1 className="truncate px-4 py-2 text-base font-medium" title={path}>
        {fileName(path)}
      </h1>
      <LoadNotice loaded={loaded} missing={missing} onRetry={reload} />
      {strip === "trash" && trash !== undefined && (
        <TrashedStrip
          announce={(text) => announcer.current.announce(text)}
          onUndo={() => void trash.undo()}
        />
      )}
      {settled !== undefined && outside === undefined && !comparing && !trashedHere && (
        <p className="px-4 pb-1 text-small text-fg-muted">{filesWords.settled[settled]}</p>
      )}
      {strip === "unreadable" && syntaxLine !== null && (
        <div className="px-4 pb-2">
          <Callout tone="warning">{filesWords.cantBeRead(fileName(path), syntaxLine)}</Callout>
        </div>
      )}
      {strip === "outside" && outside !== undefined && (
        <OutsideStrip
          path={path}
          change={outside}
          onCompare={() => setComparing(true)}
          onKeepMine={() => settleWith("keep-mine")}
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
            refocus.current = true;
            setComparing(false);
            setFailure(undefined);
            reload();
          }}
          onDone={(choice) => {
            said(choice);
            refocus.current = true;
            setComparing(false);
            setFailure(undefined);
            setOutside(host.outside().get(path));
            reload();
          }}
        />
      )}
      {editing && (
        <div
          ref={parent}
          className={`min-h-0 flex-1 overflow-hidden ${trashedHere ? "opacity-60" : ""}`}
        />
      )}
      {editing && !trashedHere && (
        <ProblemsPanel
          problems={problems}
          tooLong={loaded.kind === "ready" && loaded.readOnly}
          elsewhere={elsewhere}
          reveal={reveal}
          onGo={(issue) => editorRef.current?.goTo(issue.line, issue.col)}
          onOpenFile={(other) => context.openItem?.(fileItem(other))}
        />
      )}
    </section>
  );
}
