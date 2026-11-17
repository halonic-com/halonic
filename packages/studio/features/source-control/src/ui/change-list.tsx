import type { ChangeLine } from "@halonicjs/app";
import type { LineChange } from "@halonicjs/std";
import { Button, useToastStore } from "@halonicjs/studio-kit";
import { useId, useMemo, useRef, useState } from "react";
import { groupIntoItems } from "../change-items.ts";
import type { ChangedFile, ChangesList, DiscardOutcome } from "../changes-list.ts";
import { discardWords, listWords, undoWords, versionWords } from "../changes-words.ts";

/** Props for {@link ChangeList}. */
export interface ChangeListProps {
  readonly list: ChangesList;
  readonly files: readonly ChangedFile[];
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer?: boolean;
  /** On a phone Create version is a full-width touch button under the heading and count (2.12). */
  readonly phone?: boolean;
}

/**
 * What changed, file by file (checklist part 2, 2.2), under "Since your last version" with its
 * count and Create version. In each file the Important changes come
 * first, each as before → after, then the others; every change that can be undone on its own has
 * Undo this change.
 */
export function ChangeList({ list, files, developer = false, phone = false }: ChangeListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-heading">{versionWords.sinceLastVersion}</h2>
        <span className="text-small text-fg-muted">
          {versionWords.itemCount(groupIntoItems(files).length)}
        </span>
        <span className="flex-1" />
        {phone ? null : (
          <Button variant="primary" size="sm" onClick={() => list.startVersion()}>
            {versionWords.createVersion}
          </Button>
        )}
      </div>
      {phone ? (
        <Button variant="secondary" size="touch" block onClick={() => list.startVersion()}>
          {versionWords.createVersion}
        </Button>
      ) : null}
      <ul className="flex flex-col gap-4">
        {files.map((file) => (
          <li key={file.path}>
            <FileChanges list={list} file={file} developer={developer} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileChanges({
  list,
  file,
  developer,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly developer: boolean;
}) {
  const { lines } = file.description;
  const hunks = useMemo(() => list.hunks(file), [list, file]);
  const [showLines, setShowLines] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const discarding = useDiscardToasts();

  async function discardFile() {
    setBusy(true);
    setFailure(undefined);
    const reason = await discarding.run(await list.discardFile(file), {
      title: discardWords.discarded(1),
      text: file.path,
    });
    setBusy(false);
    setFailure(reason);
  }
  const important = lines.filter((line) => line.important);
  const other = lines.filter((line) => !line.important);
  return (
    <section aria-label={file.path} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <h2 className="text-heading flex-1 break-all">{file.path}</h2>
        {developer && hunks.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showLines}
            onClick={() => setShowLines(!showLines)}
          >
            {showLines ? discardWords.hideLines : discardWords.showLines}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" busy={busy} onClick={() => void discardFile()}>
          {developer ? discardWords.discard : discardWords.undoTheseChanges}
        </Button>
      </div>
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {discardWords.failed}. {failure}
        </span>
      )}
      {developer && showLines ? (
        <LineDiff list={list} file={file} hunks={hunks} discarding={discarding} />
      ) : null}
      {important.length === 0 ? null : (
        <Group title={listWords.important} list={list} file={file} lines={important} />
      )}
      {other.length === 0 ? null : (
        <Group
          title={important.length === 0 ? undefined : listWords.other}
          list={list}
          file={file}
          lines={other}
        />
      )}
    </section>
  );
}

/** What a discard's toast says, and what its Undo does. */
interface DiscardToasts {
  /** Shows the toast for a finished discard; gives the reason when it failed. */
  readonly run: (
    outcome: DiscardOutcome,
    toast: { readonly title: string; readonly text: string },
  ) => Promise<string | undefined>;
}

/** The toast every discard shows: what was discarded, with Undo, which puts it all back. */
function useDiscardToasts(): DiscardToasts {
  const toasts = useToastStore();
  return {
    run: async (outcome, { title, text }) => {
      if (outcome.kind === "failed") return outcome.reason;
      const { undo } = outcome;
      toasts?.show({
        tone: "success",
        title,
        text,
        action: {
          label: undoWords.undo,
          onClick: () =>
            void undo().then((reason) => {
              if (reason === undefined) return;
              toasts.show({ tone: "danger", title: discardWords.undoFailed, text: reason });
            }),
        },
      });
      return undefined;
    },
  };
}

/** What tells one part of a file from the others. */
function partKey(part: LineChange): string {
  return `${part.beforeStart}:${part.afterStart}`;
}

/** The developer view's line diff of one file: each part with its own "Discard this part". */
function LineDiff({
  list,
  file,
  hunks,
  discarding,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly hunks: readonly LineChange[];
  readonly discarding: DiscardToasts;
}) {
  const [failure, setFailure] = useState<string>();
  // The part being discarded: a second press on it, or on another part, would find the file changed.
  const [busyPart, setBusyPart] = useState<string>();
  // A ref too, since a second press can come before the page has drawn the busy state.
  const working = useRef(false);
  async function discardPart(part: LineChange) {
    if (working.current) return;
    working.current = true;
    setBusyPart(partKey(part));
    setFailure(undefined);
    try {
      const reason = await discarding.run(await list.discardPart(file, part), {
        title: discardWords.partDiscarded,
        text: file.path,
      });
      setFailure(reason);
    } finally {
      working.current = false;
      setBusyPart(undefined);
    }
  }
  return (
    <section aria-label={discardWords.lines(file.path)} className="flex flex-col gap-2">
      {hunks.map((part) => (
        <div key={partKey(part)} className="flex items-start gap-3">
          <pre className="text-small flex-1 overflow-x-auto rounded-md border border-border p-2">
            {part.removed.map((line, index) => (
              <span key={`-${index}`} className="block text-danger">
                {`- ${line.replace(/\n$/u, "")}`}
              </span>
            ))}
            {part.added.map((line, index) => (
              <span key={`+${index}`} className="block text-success">
                {`+ ${line.replace(/\n$/u, "")}`}
              </span>
            ))}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            busy={busyPart !== undefined}
            onClick={() => void discardPart(part)}
          >
            {discardWords.discardThisPart}
          </Button>
        </div>
      ))}
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {discardWords.partFailed}. {failure}
        </span>
      )}
    </section>
  );
}

function Group({
  title,
  list,
  file,
  lines,
}: {
  readonly title: string | undefined;
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly lines: readonly ChangeLine[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {title === undefined ? null : <h3 className="text-label text-fg-muted">{title}</h3>}
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line.id}>
            <ChangeRow list={list} file={file} line={line} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One change and its Undo this change, or why it can't be undone yet. */
function ChangeRow({
  list,
  file,
  line,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly line: ChangeLine;
}) {
  const toasts = useToastStore();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const reasonId = useId();
  const dependent = file.description.lines.find((other) => other.needs?.includes(line.id));

  async function undo() {
    setBusy(true);
    setFailure(undefined);
    const outcome = await list.undoChange(file, line);
    setBusy(false);
    if (outcome.kind === "failed") {
      setFailure(outcome.reason);
      return;
    }
    toasts?.show({
      tone: "success",
      title: undoWords.undone,
      text: line.sentence,
      action: { label: undoWords.undo, onClick: () => void putBack(outcome.undo) },
    });
  }

  /** The toast's Undo: puts the change back, or says why it couldn't. */
  async function putBack(undo: () => Promise<string | undefined>) {
    const reason = await undo();
    if (reason === undefined) return;
    toasts?.show({ tone: "danger", title: undoWords.undoFailed, text: reason });
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-body flex-1">{line.sentence}</span>
      {line.parts.length === 0 ? null : (
        <Button
          variant="ghost"
          size="sm"
          busy={busy}
          unavailable={dependent === undefined ? undefined : { reason: reasonId }}
          onClick={() => void undo()}
        >
          {listWords.undoThisChange}
        </Button>
      )}
      {dependent === undefined ? null : (
        <span id={reasonId} className="text-small text-fg-muted">
          {listWords.undoThatFirst(dependent.sentence)}
        </span>
      )}
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {undoWords.failed}. {failure}
        </span>
      )}
    </div>
  );
}
