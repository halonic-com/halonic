import type { ChangeLine } from "@halonicjs/app";
import type { LineChange } from "@halonicjs/std";
import { Button, StatusChip, useToastStore } from "@halonicjs/studio-kit";
import { useId, useMemo, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { discardWords, listWords, mergeWords, undoWords } from "../changes-words.ts";
import { type ChangeHeadingLevel, headingTag, levelBelow } from "./heading-level.ts";
import { LineDiff } from "./line-diff.tsx";
import { fieldsOfNew, NewFileLines, NewItemFields, WholeFile } from "./new-file.tsx";
import { PartChanges } from "./part-change.tsx";
import { type DiscardToasts, useDiscardToasts } from "./use-discard-toasts.ts";

/** Props for {@link ItemChanges}. */
export interface ItemChangesProps {
  readonly list: ChangesList;
  readonly item: ChangeItem;
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer: boolean;
  /** On a phone (2.13) the changes are in words only: no Advanced and no line diff. */
  readonly phone?: boolean;
  /** The level of the item's name above the changes: 1 on a page, 2 in the content pane. */
  readonly titleLevel?: 1 | 2;
}

/**
 * The body of What changed: each file of the item with the Important changes first, each as
 * before → after, then the others. Every change that can be undone on its own has Undo this
 * change. The item's name is the heading above, so a file's path, when shown, is one level below
 * it, and the groups and parts under the path one level further.
 */
export function ItemChanges({
  list,
  item,
  developer,
  phone = false,
  titleLevel = 1,
}: ItemChangesProps) {
  return (
    <div className="flex flex-col gap-4">
      {item.files.map((file) => (
        <FileChanges
          key={file.path}
          list={list}
          file={file}
          developer={developer}
          showPath={developer || item.files.length > 1}
          showLineDiff={!phone}
          pathLevel={titleLevel === 1 ? 2 : 3}
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
  showLineDiff,
  pathLevel,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly developer: boolean;
  /** A path is for the developer view and for telling an item's files apart, never for a row. */
  readonly showPath: boolean;
  /** Whether Advanced and its line diff are offered; a phone has no file diff. */
  readonly showLineDiff: boolean;
  /** One level below the item's name: the path's, or the groups' without a path. */
  readonly pathLevel: 2 | 3;
}) {
  const hunks = useMemo(() => list.hunks(file), [list, file]);
  const fields = useMemo(() => fieldsOfNew(file), [file]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const discarding = useDiscardToasts();
  // Headings in the file sit under its path, or straight under the item's name without one (a11y C3).
  const level = showPath ? levelBelow(pathLevel) : pathLevel;

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
  return (
    <section aria-label={file.path} className="flex flex-col gap-2">
      {showPath ? (
        <FileBar
          path={file.path}
          level={pathLevel}
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
      {fields === undefined ? (
        <ChangedItemLines list={list} file={file} level={level} />
      ) : (
        <NewItemFields file={file} fields={fields} />
      )}
      {showLineDiff ? (
        <Advanced
          list={list}
          file={file}
          hunks={hunks}
          newItem={fields !== undefined}
          level={level}
          discarding={developer ? discarding : undefined}
        />
      ) : null}
    </section>
  );
}

/**
 * Advanced: a new item's whole file, or the line diff of any other file that has one. It starts
 * open when Halonic can't say in words what changed, since the lines are all there is.
 */
function Advanced({
  list,
  file,
  hunks,
  newItem,
  level,
  discarding,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly hunks: readonly LineChange[];
  readonly newItem: boolean;
  /** The level of the line diff's part headings, as the file's groups' headings. */
  readonly level: ChangeHeadingLevel;
  readonly discarding: DiscardToasts | undefined;
}) {
  const [open, setOpen] = useState(!file.description.described && !newItem);
  if (!newItem && hunks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="self-start">
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {discardWords.advanced}
        </Button>
      </span>
      {open && newItem ? <WholeFile file={file} /> : null}
      {open && !newItem ? (
        <LineDiff list={list} file={file} hunks={hunks} level={level} discarding={discarding} />
      ) : null}
    </div>
  );
}

/**
 * What changed in a file that isn't a new item: the first lines of a new file, then the changes in
 * words, or the can't-describe layout.
 */
function ChangedItemLines({
  list,
  file,
  level,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly level: ChangeHeadingLevel;
}) {
  return (
    <>
      <NewFileLines file={file} />
      {file.description.described ? (
        <DescribedLines list={list} file={file} level={level} />
      ) : (
        <CantDescribe file={file} />
      )}
    </>
  );
}

/** The changes Halonic can put in words: the Important ones first, then the others. */
function DescribedLines({
  list,
  file,
  level,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly level: ChangeHeadingLevel;
}) {
  const important = file.description.lines.filter((line) => line.important);
  const other = file.description.lines.filter((line) => !line.important);
  return (
    <>
      {important.length === 0 ? null : (
        <Group
          title={listWords.important}
          level={level}
          list={list}
          file={file}
          lines={important}
        />
      )}
      {other.length === 0 ? null : (
        <Group
          title={important.length === 0 ? undefined : listWords.other}
          level={level}
          list={list}
          file={file}
          lines={other}
        />
      )}
    </>
  );
}

/**
 * What a file says when Halonic can't put its change in words: the label of what happened to it
 * (CHANGED, NEW or DELETED) and which file.
 */
function CantDescribe({ file }: { readonly file: ChangedFile }) {
  const label = fileLabel(file);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body">{discardWords.cantDescribe}</p>
      <div className="flex items-center gap-2">
        <StatusChip tone="neutral">{label}</StatusChip>
        <code className="text-small break-all">{file.path}</code>
      </div>
    </div>
  );
}

/** What happened to a file Halonic can't describe, by what it had before and has now. */
function fileLabel(file: ChangedFile): string {
  // A file that couldn't be read has no texts; its one line still says whether it is new or deleted.
  const sentence = file.description.lines[0]?.sentence;
  if (file.texts?.before === null || (file.texts === undefined && sentence === "New")) {
    return discardWords.fileLabel.new;
  }
  if (file.texts?.after === null || (file.texts === undefined && sentence === "Deleted")) {
    return discardWords.fileLabel.deleted;
  }
  return discardWords.fileLabel.changed;
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

/** A file's path as the heading of its changes, with the developer view's Discard. */
function FileBar({
  path,
  level,
  onDiscard,
  busy,
  list,
}: {
  readonly path: string;
  /** One level below the item's name. */
  readonly level: 2 | 3;
  /** Only the developer view discards a single file. */
  readonly onDiscard: (() => void) | undefined;
  readonly busy: boolean;
  /** Says why Discard is unavailable while a Get updates is half done. */
  readonly list: ChangesList;
}) {
  const waitingId = useId();
  const Heading = headingTag(level);
  return (
    <>
      <div className="flex items-center gap-3">
        <Heading className="text-label flex-1 break-all">{path}</Heading>
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

function Group({
  title,
  level,
  list,
  file,
  lines,
}: {
  readonly title: string | undefined;
  /** The heading level of the title: under the file's path, or straight under the item's name. */
  readonly level: ChangeHeadingLevel;
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

function GroupHeading({
  level,
  children,
}: {
  readonly level: ChangeHeadingLevel;
  readonly children: string;
}) {
  const Heading = headingTag(level);
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
    <div className="flex flex-col gap-1">
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
      <PartChanges file={file} line={line} />
    </div>
  );
}
