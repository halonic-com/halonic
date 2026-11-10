import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Field } from "../field/field.tsx";
import { Input } from "../input/input.tsx";
import { isDark, parseHex, sameColour } from "./hex.ts";
import { useAnchoredPopover } from "./use-anchored-popover.ts";

/** A colour the popover offers, with the name a screen reader says for it. */
export interface ColourPreset {
  /** Six hex digits: "#3B8BFF". */
  readonly value: string;
  /** "Blue". */
  readonly name: string;
}

export interface ColourPopoverProps {
  /** Its `id`, for the opener's `aria-controls`. */
  readonly id: string;
  /** Shown while true. The screen sets it from the opener's click and from `onClose`. */
  readonly open: boolean;
  /**
   * The button that opens it: an Input's leading button. The popover lines up with the box the
   * button sits in, and gives focus back to it on Escape.
   */
  readonly opener: RefObject<HTMLElement | null>;
  /** Escape, a press outside, or focus leaving it. The screen sets `open` to false. */
  readonly onClose: () => void;
  /** Its name, in the feature's verb: "Choose the first colour". */
  readonly label: string;
  /** The colours offered, four to a row. */
  readonly presets: readonly ColourPreset[];
  /** The last good colour. A preset that names it is picked. */
  readonly value: string;
  /** Called with a picked preset, or with a typed hex as soon as it's six digits. */
  readonly onChange: (colour: string) => void;
  /** The presets' heading: "Presets". */
  readonly presetsLabel: string;
  /** The hex field's label: "Hex colour". */
  readonly hexLabel: string;
  /** Shown under the hex field when what's typed isn't a colour: "Use six digits, like #3B8BFF." */
  readonly hexError: string;
}

/**
 * 244px, `surface-raised`, radius 12px, `shadow-2`, padding 12px (decision P-D1). A transparent
 * edge that shows in high contrast and turns `border-control` with more contrast. On a phone it
 * spans the screen less 8px each side, like the Menu.
 */
const popoverClasses = [
  "m-0 inset-auto w-61 rounded-md border border-transparent bg-surface-raised p-3 text-fg shadow-2",
  "contrast-more:border-border-control phone:w-[calc(100vw-1rem)]",
  "transition-opacity duration-(--duration-fast) ease-enter starting:opacity-0",
].join(" ");

/** A plain 14px tick: the picked swatch's check (P-D2). */
function Tick({ dark }: { readonly dark: boolean }) {
  // `on-primary` is white in a light scheme and ink in a dark one, so the scheme picks the
  // colour that shows on this swatch, from the theme's own tokens.
  const scheme = dark ? "scheme-light" : "scheme-dark";
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-on-primary forced-color-adjust-none peer-checked:block ${scheme}`}
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

interface SwatchesProps {
  readonly presets: readonly ColourPreset[];
  readonly value: string;
  readonly label: string;
  readonly onPick: (preset: ColourPreset) => void;
}

/**
 * The presets as one radio group of native radios: Tab reaches it once and the arrow keys move
 * the pick. Each is a 24px swatch in a 24px cell, a 48px target on a phone (P-D5).
 */
function Swatches({ presets, value, label, onPick }: SwatchesProps) {
  const headingId = useId();
  const name = useId();
  return (
    <>
      <p id={headingId} className="pb-2 text-caption uppercase tracking-label text-fg-muted">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="grid grid-cols-[repeat(4,auto)] justify-between gap-y-2 phone:gap-y-0"
      >
        {presets.map((preset) => (
          <label
            key={preset.value}
            className="relative grid size-6 place-items-center phone:size-12"
          >
            <input
              type="radio"
              name={name}
              value={preset.value}
              aria-label={preset.name}
              checked={sameColour(preset.value, value)}
              onChange={() => onPick(preset)}
              className="peer swatch"
              style={{ "--swatch": preset.value } as CSSProperties}
            />
            <Tick dark={isDark(preset.value)} />
          </label>
        ))}
      </div>
    </>
  );
}

interface HexFieldProps {
  /** Changes on each opening and each pick: the field then starts again from `value`. */
  readonly fresh: number;
  readonly value: string;
  readonly onChange: (colour: string) => void;
  readonly label: string;
  readonly error: string;
}

/**
 * The hex Input under the presets. A typed six-digit hex applies at once; what isn't a colour
 * yet changes nothing, and says why once you leave the field or press Enter (P-D4).
 */
function HexField({ fresh, value, onChange, label, error }: HexFieldProps) {
  /** What's typed, until it's left; `null` shows `value`. */
  const [draft, setDraft] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  // Starting again while rendering, not in an effect, so the old text never shows for a frame.
  // The same input stays, so nothing holding it loses it.
  const [seen, setSeen] = useState(fresh);
  if (seen !== fresh) {
    setSeen(fresh);
    setDraft(null);
    setShowError(false);
  }
  const text = draft ?? value;
  // Leaving the field or Enter: a colour is written the field's way, anything else says why.
  const settle = () => {
    if (parseHex(text) === null) {
      setShowError(true);
    } else {
      setDraft(null);
    }
  };
  return (
    <Field label={label} error={showError ? error : null}>
      <Input
        value={text}
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(event) => {
          setDraft(event.target.value);
          const colour = parseHex(event.target.value);
          if (colour !== null) {
            setShowError(false);
            onChange(colour);
          }
        }}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Not the form round the field: Enter here only checks the colour.
            event.preventDefault();
            settle();
          }
        }}
      />
    </Field>
  );
}

/**
 * How the popover closes besides a press outside (which the anchoring hook sees): Escape, which
 * gives focus back to its button, and focus moving out of it, as Tab past the hex field does.
 */
function closeHandlers(opener: RefObject<HTMLElement | null>, onClose: () => void) {
  return {
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        opener.current?.focus();
      }
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next !== null && !event.currentTarget.contains(next) && !opener.current?.contains(next)) {
        onClose();
      }
    },
  };
}

/**
 * The popover a colour field's leading button opens (component specs 3 and 23.3 L10): preset
 * swatches as a radio group, and a hex Input under them. There's no hidden `<input
 * type="color">`, because whether WebKitGTK opens one from the keyboard depends on its version.
 *
 * A pick or a typed six-digit hex applies at once through `onChange`; a valid hex that isn't a
 * preset leaves none of them picked. What isn't a colour yet changes nothing: the screen keeps
 * the last good colour, and the hex field shows `hexError` once you leave it or press Enter.
 *
 * @example
 * <ColourPopover id="first-colour" open={open} opener={swatchButton} onClose={() => setOpen(false)}
 *   label="Choose the first colour" presets={PRESETS} value={first} onChange={setFirst}
 *   presetsLabel="Presets" hexLabel="Hex colour" hexError="Use six digits, like #3B8BFF." />
 */
export function ColourPopover(props: ColourPopoverProps) {
  const { id, open, opener, onClose, label, value, onChange } = props;
  const popover = useRef<HTMLDivElement>(null);
  /** Bumped on each opening and each pick, so the hex field starts again from `value`. */
  const [fresh, setFresh] = useState(0);
  useAnchoredPopover(popover, opener, open, onClose);

  // Each opening starts from the last good colour, with focus on its preset (or the first).
  useEffect(() => {
    if (!open) {
      return;
    }
    setFresh((count) => count + 1);
    const radios = [...(popover.current?.querySelectorAll<HTMLInputElement>("[type=radio]") ?? [])];
    (radios.find((radio) => radio.checked) ?? radios[0])?.focus();
  }, [open]);

  return (
    <div
      id={id}
      ref={popover}
      popover="manual"
      role="dialog"
      aria-label={label}
      className={popoverClasses}
      {...closeHandlers(opener, onClose)}
    >
      <Swatches
        presets={props.presets}
        value={value}
        label={props.presetsLabel}
        onPick={(preset) => {
          setFresh((count) => count + 1);
          onChange(preset.value);
        }}
      />
      <div className="mt-3">
        <HexField
          fresh={fresh}
          value={value}
          onChange={onChange}
          label={props.hexLabel}
          error={props.hexError}
        />
      </div>
    </div>
  );
}
