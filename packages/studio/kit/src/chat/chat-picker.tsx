import {
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from "react";
import { isComposing } from "../keyboard/is-composing.ts";

/** One row of a `ChatComposer`'s picker. */
export interface ChatPickerOption {
  /** Unique among the options; `onPick` gets it back. */
  readonly id: string;
  /** What the row shows: a name, and a title after it. */
  readonly content: ReactNode;
}

/**
 * A list a `ChatComposer` opens above its box while the person types, such as the members a
 * channel's `@` offers. The feature decides when it's open and what it offers; the kit moves the
 * active row and tells a screen reader which one it is.
 */
export interface ChatComposerPicker {
  /** The line above the rows, which also names the list: "Members · ↑↓ to pick · …". */
  readonly label: string;
  readonly open: boolean;
  readonly options: readonly ChatPickerOption[];
  /** Called with the row picked by Enter or a click. Enter then sends nothing. */
  readonly onPick: (id: string) => void;
  /** Called by Esc. */
  readonly onClose: () => void;
}

/** What `ChatComposer` puts on its box and draws above it for a picker. */
export interface ChatPickerState {
  /** The combobox attributes of the box, or none without a picker. */
  readonly boxAttributes: Pick<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "role" | "aria-autocomplete" | "aria-expanded" | "aria-controls" | "aria-activedescendant"
  >;
  readonly listboxId: string;
  readonly labelId: string;
  readonly activeIndex: number;
  optionId(index: number): string;
  pick(id: string): void;
  /** Handles ↑↓, Enter and Esc while the picker is open; true when the key was its. */
  handleKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean;
}

/**
 * The picker's active row and keys. The active row is kept by `id`, so it stays on the same row
 * while typing filters the list, and falls back to the first when that row leaves it.
 */
export function useChatPicker(picker: ChatComposerPicker | undefined): ChatPickerState {
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const listboxId = useId();
  const labelId = useId();
  const options = picker?.open === true ? picker.options : [];
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.id === activeId),
  );
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const expanded = options.length > 0;

  function pick(id: string) {
    setActiveId(undefined);
    picker?.onPick(id);
  }

  function move(step: number) {
    const next = options[(activeIndex + step + options.length) % options.length];
    setActiveId(next?.id);
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (picker?.open !== true || isComposing(event)) return false;
    const active = options[activeIndex];
    if (event.key === "ArrowDown" && expanded) move(1);
    else if (event.key === "ArrowUp" && expanded) move(-1);
    else if (event.key === "Escape") {
      setActiveId(undefined);
      picker.onClose();
    } else if (event.key === "Enter" && !event.shiftKey && active !== undefined) pick(active.id);
    // Any other key, and Enter with nothing to pick, goes on to the box.
    else return false;
    event.preventDefault();
    return true;
  }

  const boxAttributes: ChatPickerState["boxAttributes"] =
    picker === undefined
      ? {}
      : {
          role: "combobox",
          "aria-autocomplete": "list",
          "aria-expanded": expanded,
          "aria-controls": expanded ? listboxId : undefined,
          "aria-activedescendant": expanded ? optionId(activeIndex) : undefined,
        };
  return { boxAttributes, listboxId, labelId, activeIndex, optionId, pick, handleKey };
}

/**
 * A picker row. Focus stays in the box, so the active row's fill is the only sign of it; as on a
 * menu row, high contrast, which drops the fill, shows the see-through outline instead, and more
 * contrast shows it as an edge as well (HAL-18316 KT1).
 */
const optionClasses = [
  "flex min-h-control-md cursor-pointer items-center rounded-md px-2 py-1 text-start text-body",
  "phone:min-h-touch touch:min-h-touch aria-selected:bg-surface-muted",
  "outline-2 -outline-offset-2 outline-transparent aria-selected:outline-solid",
  "contrast-more:aria-selected:outline-border-control",
].join(" ");

/** The picker's rows above the box: a listbox whose active row the box names. */
export function ChatPickerList({
  picker,
  state,
}: {
  readonly picker: ChatComposerPicker;
  readonly state: ChatPickerState;
}) {
  if (!picker.open) return null;
  return (
    <div data-chat-picker="" className="rounded-md border border-border p-1">
      <p id={state.labelId} className="px-2 text-small text-fg-muted">
        {picker.label}
      </p>
      {picker.options.length === 0 ? null : (
        <div id={state.listboxId} role="listbox" aria-labelledby={state.labelId}>
          {picker.options.map((option, index) => (
            // The rows aren't focusable: focus stays in the box, which names the active row
            // (the combobox pattern), so a click mustn't take focus either.
            // biome-ignore lint/a11y/useKeyWithClickEvents: the box handles the keys for every row.
            <div
              key={option.id}
              id={state.optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === state.activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => state.pick(option.id)}
              className={optionClasses}
            >
              {option.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
