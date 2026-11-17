import type { ChangeLine } from "@halonicjs/app";
import type { LineChange } from "@halonicjs/std";
import { Button, useToastStore } from "@halonicjs/studio-kit";
import { useId, useMemo, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { discardWords, listWords, mergeWords, undoWords } from "../changes-words.ts";
import { type DiscardToasts, useDiscardToasts } from "./use-discard-toasts.ts";

/** Props for {@link ItemChanges}. */
export interface ItemChangesProps {
  readonly list: ChangesList;
  readonly item: ChangeItem;
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer: boolean;
}

/**
 * The body of What changed: each file of the item with the Important changes first, each as
 * before → after, then the others. Every change that can be undone on its own has Undo this
 * change. The page's `h1` is the item's name, so a file's path, when shown, is the `h2`, and the
 * groups and parts under it go one level down.
 */
export function ItemChanges({ list, item, developer }: ItemChangesProps) {
  return (
    <div className="flex flex-col gap-4">
      {item.files.map((file) => (
        <FileChanges
          key={file.path}
          list={list}
          file={file}
          developer={developer}
          showPath={developer || item.files.length > 1}
        />
      ))}
    </div>
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

  async function discardFile() {
    setBusy(true);
    setFailure(undefined);
    const reason = await discarding.run(await list.discardFile(file), {
      title: discardWords.fileDiscarded,
      text: file.path,
    });
    setBusy(false);
    setFailure(reason);
  }
  const important = lines.filter((line) => line.important);
  const other = lines.filter((line) => !line.important);
  return (
    <section aria-label={file.path} className="flex flex-col gap-2">
      {showPath ? (
        <FileBar
          path={file.path}
          canShowLines={developer && hunks.length > 0}
          showLines={showLines}
          onToggleLines={() => setShowLines(!showLines)}
          onDiscard={developer ? () => void discardFile() : undefined}
          busy={busy}
          list={list}
        />
      ) : null}
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {discardWords.failed}. {failure}
        </span>
      )}
      {developer && showLines ? (
        <LineDiff list={list} file={file} hunks={hunks} discarding={discarding} />
      ) : null}
      <NewFileLines file={file} />
      {important.length === 0 ? null : (
        <Group
          title={listWords.important}
          level={showPath ? 3 : 2}
          list={list}
          file={file}
          lines={important}
        />
      )}
      {other.length === 0 ? null : (
        <Group
          title={important.length === 0 ? undefined : listWords.other}
          level={showPath ? 3 : 2}
          list={list}
          file={file}
          lines={other}
        />
      )}
    </section>
  );
}

/** Says why changes can't be undone while a Get updates is half done; nothing otherwise. */
export function WaitingNote({ list, id }: { readonly list: ChangesList; readonly id: string }) {
  if (!list.merging) return null;
  return (
    <span id={id} className="text-small text-fg-muted">
      {mergeWords.finishFirst}
    </span>
  );
}

/** A file's path as the heading of its changes, with the developer view's Show lines and Discard. */
function FileBar({
  path,
  canShowLines,
  showLines,
  onToggleLines,
  onDiscard,
  busy,
  list,
}: {
  readonly path: string;
  readonly canShowLines: boolean;
  readonly showLines: boolean;
  readonly onToggleLines: () => void;
  /** Only the developer view discards a single file. */
  readonly onDiscard: (() => void) | undefined;
  readonly busy: boolean;
  /** Says why Discard is unavailable while a Get updates is half done. */
  readonly list: ChangesList;
}) {
  const waitingId = useId();
  return (
    <>
      <div className="flex items-center gap-3">
        <h2 className="text-label flex-1 break-all">{path}</h2>
        {canShowLines ? (
          <Button variant="ghost" size="sm" aria-expanded={showLines} onClick={onToggleLines}>
            {showLines ? discardWords.hideLines : discardWords.showLines}
          </Button>
        ) : null}
        {onDiscard === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            busy={busy}
            unavailable={list.merging ? { reason: waitingId } : undefined}
            onClick={onDiscard}
          >
            {discardWords.discard}
          </Button>
        )}
      </div>
      {onDiscard === undefined ? null : <WaitingNote list={list} id={waitingId} />}
    </>
  );
}

/** How many lines of a new file are shown, so the person can tell what they would discard. */
const previewLines = 8;

/** The first lines of a file that is new; nothing for any other file. */
function NewFileLines({ file }: { readonly file: ChangedFile }) {
  const text = file.texts?.before === null ? file.texts.after : null;
  if (text === null || text === undefined || text.trim() === "") return null;
  const lines = text.replace(/\n$/u, "").split("\n");
  const rest = lines.length - previewLines;
  return (
    <section aria-label={discardWords.firstLines(file.path)} className="flex flex-col gap-1">
      <pre className="text-small overflow-x-auto rounded-md border border-border p-2">
        {lines.slice(0, previewLines).join("\n")}
      </pre>
      {rest > 0 ? (
        <span className="text-small text-fg-muted">{mergeWords.moreLines(rest)}</span>
      ) : null}
    </section>
  );
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
            <h3 className="text-small text-fg-muted">{partHeading(part)}</h3>
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
  level,
  list,
  file,
  lines,
}: {
  readonly title: string | undefined;
  /** The heading level of the title: under the file's path, or straight under the page's `h1`. */
  readonly level: 2 | 3;
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly lines: readonly ChangeLine[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {title === undefined ? null : <GroupHeading level={level}>{title}</GroupHeading>}
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

function GroupHeading({ level, children }: { readonly level: 2 | 3; readonly children: string }) {
  const Heading = level === 2 ? "h2" : "h3";
  return <Heading className="text-label text-fg-muted">{children}</Heading>;
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
