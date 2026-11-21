import {
  AlertIcon,
  isComposing,
  useFieldAnnounce,
  useFieldErrorAnnouncement,
} from "@halonicjs/studio-kit";
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { useCutTextTooltip } from "../cut-text/cut-text-tooltip.ts";

/** What the name field reads out itself. */
export const nameFieldWords = {
  /** Read when the field is left with a name that has a problem, and the old name comes back. */
  notChanged: (problem: string) => `Name not changed: ${problem}`,
} as const;

/**
 * How long the field waits after the last key before it shows why a name can't be kept: the pause
 * the Agents fields check and save after, so a problem isn't shown and read for every letter.
 */
export const nameCheckPauseMs = 800;

/** Props for {@link NameField}. */
export interface NameFieldProps {
  /** The item's name now. */
  readonly name: string;
  /** Its name, as a field's name: "Workflow name". */
  readonly label: string;
  /** Called with the new name, trimmed, when the user keeps one that differs. */
  readonly onRename: (name: string) => void;
  /**
   * Checks a new name, trimmed, as it is typed: the sentence for why it can't be kept ("A workflow
   * called Mail triage already exists."), or `undefined` when it can. Without it every name that
   * isn't empty is kept.
   */
  readonly check?: ((name: string) => string | undefined) | undefined;
}

/**
 * The item's name in its page header, as a rename field (req-shell `item-page.chat-and-panel`,
 * a11y 6.1). It reads as the title until it's hovered or focused. Enter or leaving the field keeps
 * the name; Esc puts the old one back, and that press does nothing else. An empty name isn't kept:
 * the old one comes back. A name cut with "…" shows in full as a tooltip. With `check`, a new name
 * with a problem shows why under the field once the typing pauses, and that line is read out once,
 * since a screen reader doesn't read a description again when it changes under focus. Enter doesn't
 * keep that name and reads the line again; leaving the field puts the old name back and says so.
 * The field takes its type from the heading it sits in.
 */
export function NameField({ name, label, onRename, check }: NameFieldProps) {
  const [draft, setDraft] = useState(name);
  const problemId = useId();
  const next = draft.trim();
  const problem = next === "" || next === name ? undefined : check?.(next);
  // The line under the field waits for the typing to pause; Enter shows it at once.
  const [paused, setPaused] = useState(draft);
  const shownProblem = paused === draft ? problem : undefined;
  const input = useRef<HTMLInputElement | null>(null);
  const announce = useFieldAnnounce();
  useFieldErrorAnnouncement(input, label, shownProblem, true);
  // The name this edit last asked for. Enter and then leaving the field is one edit, and `name`
  // may not have changed in between (the rename is async, or was rejected), so it's asked for
  // once. Typing starts a new edit, which may ask for the same name again.
  const asked = useRef<string | undefined>(undefined);
  const tooltip = useCutTextTooltip(draft);
  // The field is the tooltip's anchor and the element the announcement checks focus in.
  const anchorRef = tooltip.anchor.ref;
  const fieldRef = useCallback(
    (node: HTMLInputElement | null) => {
      input.current = node;
      anchorRef(node);
    },
    [anchorRef],
  );

  // A rename from somewhere else (the file, another tab) shows here.
  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    const timer = setTimeout(() => setPaused(draft), nameCheckPauseMs);
    return () => clearTimeout(timer);
  }, [draft]);

  const putBack = () => {
    setDraft(name);
    setPaused(name);
  };

  const keep = () => {
    if (problem !== undefined) {
      announce?.(nameFieldWords.notChanged(problem));
    }
    if (next === "" || next === name || problem !== undefined) {
      putBack();
      return;
    }
    if (next === asked.current) {
      return;
    }
    asked.current = next;
    onRename(next);
  };

  const edit = (value: string) => {
    asked.current = undefined;
    setDraft(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    editKeys(event);
    // Esc puts the old name back before it hides the tooltip: an inline edit is above a tooltip in
    // the Escape order (specs 23 A7).
    if (!(event.defaultPrevented || isComposing(event.nativeEvent))) {
      tooltip.anchor.onKeyDown(event);
    }
  };

  const editKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event.nativeEvent)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (problem === undefined) {
        keep();
      } else if (shownProblem === undefined) {
        // The problem stays in view with the name that has it, so it can be fixed. Showing it
        // reads it, through the announcement above.
        setPaused(draft);
      } else {
        announce?.(`${label}: ${problem}`);
      }
    } else if (event.key === "Escape" && draft !== name) {
      // The press is used, so the close stack under the page doesn't act on it too.
      event.preventDefault();
      putBack();
    }
  };

  return (
    // The field and a hidden copy of its text share one grid cell, so the field is exactly as wide
    // as the name it shows, up to the room left, and the ⋮ sits right after it. The input's own width
    // must not count: `w-0` gives it none, so the hidden copy alone sets the cell's width, and
    // `min-w-full` then stretches the input to fill the cell. `size={1}` alone isn't enough, since
    // browsers still give a one-character input a minimum of several characters; it stays for
    // browsers that ignore `w-0` here. A `size` of the name's length counts average characters, which
    // comes out too wide or too narrow in a proportional font.
    <span className="relative inline-grid min-w-0 max-w-full grid-cols-[minmax(0,auto)]">
      <span aria-hidden="true" data-name-sizer="" className={sizerClasses}>
        {draft === "" ? " " : draft}
      </span>
      <input
        {...tooltip.anchor}
        ref={fieldRef}
        type="text"
        size={1}
        aria-label={label}
        aria-invalid={shownProblem === undefined ? undefined : true}
        aria-describedby={shownProblem === undefined ? undefined : problemId}
        value={draft}
        spellCheck={false}
        data-text-entry=""
        className={nameClasses}
        onChange={(event) => edit(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          tooltip.anchor.onBlur();
          keep();
        }}
      />
      {tooltip.popover}
      {shownProblem !== undefined && (
        // Under the field, over what follows, so the header doesn't grow. The field is in the page's
        // `h1`: hidden, the line isn't read as part of the title, and the field's description still
        // reads it.
        <span id={problemId} aria-hidden="true" className={problemClasses}>
          <span className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full">
            <AlertIcon />
          </span>
          {shownProblem}
        </span>
      )}
    </span>
  );
}

// The title's look, taken from the heading the field sits in (an item page's `text-section`, the
// Workflows page's `text-title`), with a 4px inset so the text lines up with the kind label; a
// quiet fill on hover says it can be edited, and focus is the standard ring.
const nameClasses = [
  "col-start-1 row-start-1 w-0 min-w-full truncate rounded-xs border-0 bg-transparent px-1",
  "[font:inherit] [letter-spacing:inherit] text-fg hover:bg-surface-subtle focus:bg-surface",
  "focus-ring",
].join(" ");

// The kit Field's error line under the field, over what follows so the header doesn't move. It's
// as wide as its text, and a long one wraps before the window's edge.
const problemClasses = [
  "absolute top-full left-0 z-10 mt-1 flex w-max max-w-[min(36rem,calc(100vw-5rem))]",
  "items-start gap-1 rounded-xs bg-surface px-1 text-caption font-normal text-danger",
].join(" ");

// The same text, inset and type as the field, kept in the layout but never seen.
const sizerClasses = [
  "invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-1",
  "[font:inherit] [letter-spacing:inherit]",
].join(" ");
