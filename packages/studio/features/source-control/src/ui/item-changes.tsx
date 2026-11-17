import type { ChangeLine } from "@halonicjs/app";
import type { LineChange } from "@halonicjs/std";
import { Button, useToastStore } from "@halonicjs/studio-kit";
import { useId, useMemo, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangedFile, ChangesList, DiscardOutcome } from "../changes-list.ts";
import { discardWords, listWords, mergeWords, undoWords } from "../changes-words.ts";

/** Props for {@link ItemChanges}. */
export interface ItemChangesProps {
  readonly list: ChangesList;
  readonly item: ChangeItem;
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer: boolean;
  /** Where focus goes when what it was on is gone, such as the Undo button of the last change. */
  readonly headingRef: React.Ref<HTMLHeadingElement>;
}

/**
 * What changed in one item, opened from its row: the item's name, then each of its files with the
 * Important changes first, each as before → after, then the others. Every change that can be
 * undone on its own has Undo this change.
 */
export function ItemChanges({ list, item, developer, headingRef }: ItemChangesProps) {
  return (
    <section
      aria-label={item.name}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <h3 ref={headingRef} tabIndex={-1} className="text-heading outline-none">
        {item.name}
      </h3>
      {item.files.map((file) => (
        <FileChanges
          key={file.path}
          list={list}
          file={file}
          developer={developer}
          showPath={developer || item.files.length > 1}
        />
      ))}
    </section>
  );
}

function FileChanges({
  list,
  file,
  developer,
  showPath,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly developer: boolean;
  /** A path is for the developer view and for telling an item's files apart, never for a row. */
  readonly showPath: boolean;
}) {
  const { lines } = file.description;
  const hunks = useMemo(() => list.hunks(file), [list, file]);
  const [showLines, setShowLines] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const discarding = useDiscardToasts();
  const waitingId = useId();

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
        <span className={showPath ? "text-label flex-1 break-all" : "flex-1"}>
          {showPath ? file.path : null}
        </span>
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
        <Button
          variant="ghost"
          size="sm"
          busy={busy}
          unavailable={list.merging ? { reason: waitingId } : undefined}
          onClick={() => void discardFile()}
        >
          {developer ? discardWords.discard : discardWords.undoTheseChanges}
        </Button>
      </div>
      <WaitingNote list={list} id={waitingId} />
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

/** Says why changes can't be undone while a Get updates is half done; nothing otherwise. */
function WaitingNote({ list, id }: { readonly list: ChangesList; readonly id: string }) {
  if (!list.merging) return null;
  return (
    <span id={id} className="text-small text-fg-muted">
      {mergeWords.finishFirst}
    </span>
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

/** "Lines 12 to 18": where the part is in the file now, or where it was when it only removed lines. */
function partHeading(part: LineChange): string {
  if (part.added.length > 0) {
    return discardWords.partLines(part.afterStart + 1, part.afterStart + part.added.length);
  }
  return discardWords.partLines(part.beforeStart + 1, part.beforeEnd);
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
          <div className="flex-1">
            <h5 className="text-small text-fg-muted">{partHeading(part)}</h5>
            <pre className="text-small overflow-x-auto rounded-md border border-border p-2">
              {part.removed.map((line, index) => (
                <span key={`-${index}`} className="block text-danger">
                  <span className="sr-only">{discardWords.removedLine} </span>
                  {`- ${line.replace(/\n$/u, "")}`}
                </span>
              ))}
              {part.added.map((line, index) => (
                <span key={`+${index}`} className="block text-success">
                  <span className="sr-only">{discardWords.addedLine} </span>
                  {`+ ${line.replace(/\n$/u, "")}`}
                </span>
              ))}
            </pre>
          </div>
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
      {title === undefined ? null : <h4 className="text-label text-fg-muted">{title}</h4>}
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

  // What keeps Undo this change from working now: a half-done Get updates, or another change.
  let why: string | undefined;
  if (list.merging) why = mergeWords.finishFirst;
  else if (dependent !== undefined) why = listWords.undoThatFirst(dependent.sentence);

  return (
    <div className="flex items-center gap-3">
      <span className="text-body flex-1">{line.sentence}</span>
      {line.parts.length === 0 ? null : (
        <Button
          variant="ghost"
          size="sm"
          busy={busy}
          unavailable={why === undefined ? undefined : { reason: reasonId }}
          onClick={() => void undo()}
        >
          {listWords.undoThisChange}
        </Button>
      )}
      {why === undefined ? null : (
        <span id={reasonId} className="text-small text-fg-muted">
          {why}
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
