import { Button, CloseIcon, Input, PlusIcon } from "@halonicjs/studio-kit";
import { type KeyboardEvent, type Ref, useEffect, useRef, useState } from "react";
import { configurationWords as words } from "./configuration-words.ts";

/** Props for {@link OptionChips}. */
export interface OptionChipsProps {
  /** The list's name for screen readers: "One of a list". */
  readonly label: string;
  readonly options: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  /** The `id` of the error line under the list, while it has one. */
  readonly describedBy?: string | undefined;
}

const chipClasses =
  "inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface-subtle ps-3 text-body text-fg";

const addChipClasses =
  "inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-accent px-3 text-body text-accent hover:bg-accent-soft focus-ring";

/**
 * The options of "One of a list" as a chip list (UX checklist 2.9): a chip per option with its ✕,
 * then the dashed Add chip, which opens a box for the next option. After a remove, focus goes to
 * the next chip's ✕, else the Add chip.
 */
export function OptionChips({ label, options, onChange, describedBy }: OptionChipsProps) {
  const list = useRef<HTMLUListElement>(null);
  const addChip = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);

  const remove = (index: number) => {
    onChange(options.filter((_, at) => at !== index));
    // The pressed ✕ is gone, so the chip after it now has its place in the list.
    queueMicrotask(() => {
      const next = list.current?.querySelectorAll("button")[index];
      (next ?? addChip.current)?.focus();
    });
  };

  const cancel = () => {
    setAdding(false);
    queueMicrotask(() => addChip.current?.focus());
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.length > 0 && (
        <ul ref={list} aria-label={label} className="flex flex-wrap gap-2">
          {options.map((option, index) => (
            <li key={option} className={chipClasses}>
              {option}
              <Button
                variant="ghost"
                size="sm"
                icon={<CloseIcon />}
                label={words.removeOption(option)}
                onClick={() => remove(index)}
              />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <AddOptionBox
          add={(option) => {
            if (!options.includes(option)) onChange([...options, option]);
          }}
          leave={() => setAdding(false)}
          cancel={cancel}
          describedBy={describedBy}
        />
      ) : (
        <AddChip ref={addChip} describedBy={describedBy} open={() => setAdding(true)} />
      )}
    </div>
  );
}

interface AddChipProps {
  readonly ref: Ref<HTMLButtonElement>;
  readonly describedBy: string | undefined;
  readonly open: () => void;
}

/** The last chip, dashed and in accent text: it opens the box for a new option. */
function AddChip({ ref, describedBy, open }: AddChipProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={addChipClasses}
      aria-label={words.addOptionName}
      aria-describedby={describedBy}
      onClick={open}
    >
      <span className="inline-grid size-icon-sm *:size-full">
        <PlusIcon />
      </span>
      {words.addOption}
    </button>
  );
}

interface AddOptionBoxProps {
  /** Adds a typed option, trimmed and not empty. */
  readonly add: (option: string) => void;
  /** The person left the box. */
  readonly leave: () => void;
  /** The person pressed Esc. */
  readonly cancel: () => void;
  readonly describedBy: string | undefined;
}

/**
 * The Add chip's box, focused when it opens. Enter adds the option and keeps the box open for one
 * more; leaving the box adds what was typed and closes it; Esc closes it without adding.
 */
function AddOptionBox({ add, leave, cancel, describedBy }: AddOptionBoxProps) {
  const box = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  // The blur that closing the box on Esc may cause must not add what was typed.
  const cancelled = useRef(false);

  useEffect(() => {
    box.current?.focus();
  }, []);

  const commit = () => {
    const option = draft.trim();
    if (option !== "") add(option);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      // Esc closes the box only, not the panel around it.
      event.preventDefault();
      event.stopPropagation();
      cancelled.current = true;
      cancel();
    }
  };

  return (
    <div className="w-40">
      <Input
        ref={box}
        size="sm"
        aria-label={words.newOption}
        {...(describedBy === undefined ? {} : { describedBy })}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (cancelled.current) return;
          commit();
          leave();
        }}
      />
    </div>
  );
}
