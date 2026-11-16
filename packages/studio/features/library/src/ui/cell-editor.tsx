import { Input, Select } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { CollectionColumn } from "../collection-host.ts";
import { collectionWords } from "../collection-words.ts";
import type { CellMove } from "./grid-focus.ts";

/** What the editor of one cell needs. */
interface CellEditorProps {
  readonly field: CollectionColumn;
  readonly label: string;
  readonly initial: string;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
  /** The cell focus goes to after `move`; none where there is no such cell. */
  readonly focusTarget: (move: CellMove) => HTMLElement | null | undefined;
}

/** What an editor's `finish` takes: the text to save, or none to drop it; where focus goes, or nowhere. */
type Finish = (text: string | undefined, move: CellMove | undefined) => void;

/**
 * The keys both editors share: Escape drops the text, Enter saves and goes down, Tab saves and
 * goes to the next cell (Shift Tab the one before). At the grid's ends Tab saves and leaves
 * the grid.
 */
function editorKeys(
  event: KeyboardEvent,
  text: string,
  finish: Finish,
  focusTarget: CellEditorProps["focusTarget"],
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finish(undefined, "stay");
  } else if (event.key === "Enter") {
    event.preventDefault();
    finish(text, "down");
  } else if (event.key === "Tab") {
    const move = event.shiftKey ? "previous" : "next";
    if (focusTarget(move)) {
      event.preventDefault();
      finish(text, move);
    } else {
      finish(text, "stay");
    }
  }
}

/** A choice's editor: the kit's list inside a wrapper that takes its keys and blur. */
function ChoiceEditor({
  field,
  label,
  initial,
  finish,
  focusTarget,
  list,
}: {
  readonly field: CollectionColumn;
  readonly label: string;
  readonly initial: string;
  readonly finish: Finish;
  readonly focusTarget: CellEditorProps["focusTarget"];
  readonly list: React.RefObject<HTMLElement | null>;
}) {
  return (
    // The kit's Select has no key or blur props: they come up to this wrapper.
    // biome-ignore lint/a11y/noStaticElementInteractions: it only listens; the select inside is the control
    <span
      className="block"
      onKeyDown={(event) => editorKeys(event, initial, finish, focusTarget)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) finish(initial, undefined);
      }}
    >
      <Select
        aria-label={label}
        size="sm"
        value={initial}
        options={[
          ...(field.required ? [] : [{ value: "", label: "" }]),
          ...field.choices.map((choice) => ({ value: choice, label: choice })),
        ]}
        onChange={(value) => finish(value, "stay")}
        ref={list}
      />
    </span>
  );
}

/**
 * The editor of one cell: a list for a choice, a text box for the rest. Enter or leaving the cell
 * saves; Escape drops what was typed. Enter and Tab move focus on, Escape and a pick keep it on
 * the cell.
 */
export function CellEditor({
  field,
  label,
  initial,
  onCommit,
  onCancel,
  focusTarget,
}: CellEditorProps) {
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLElement>(null);

  // The editor opens with focus in it, once.
  // A typed character that opened it is already in the box: the caret goes after it.
  useEffect(() => {
    const box = input.current;
    box?.setSelectionRange(box.value.length, box.value.length);
    (box ?? list.current)?.focus();
  }, []);

  const finish: Finish = (text, move) => {
    if (done.current) return;
    done.current = true;
    if (text === undefined) onCancel();
    else onCommit(text);
    if (move === undefined) return;
    // The cell comes back first, so a move with nowhere to go still leaves focus on it.
    queueMicrotask(() => (focusTarget(move) ?? focusTarget("stay"))?.focus());
  };

  if (field.type === "choice") {
    return (
      <ChoiceEditor
        field={field}
        label={label}
        initial={initial}
        finish={finish}
        focusTarget={focusTarget}
        list={list}
      />
    );
  }
  return (
    <Input
      aria-label={label}
      size="sm"
      defaultValue={initial}
      inputMode={field.type === "number" || field.type === "money" ? "decimal" : "text"}
      ref={input}
      onKeyDown={(event) => editorKeys(event, event.currentTarget.value, finish, focusTarget)}
      onBlur={(event) => finish(event.currentTarget.value, undefined)}
    />
  );
}

/** What a cell holds: its text and, for a new row's empty cell, the default it will get; or its editor. */
export function CellBody({
  editing,
  shown,
  preview,
  ...editor
}: CellEditorProps & {
  readonly editing: boolean;
  readonly shown: string;
  readonly preview: string;
}) {
  if (editing) return <CellEditor {...editor} />;
  return (
    <>
      {shown}
      {preview === "" ? null : (
        <>
          {preview}{" "}
          <span className="rounded-sm bg-surface-subtle px-1 text-small text-fg-muted">
            {collectionWords.defaultTag}
          </span>
        </>
      )}
    </>
  );
}
