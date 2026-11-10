import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { assignRef, describedBy } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";

/** Why a slider can't be used right now, written as visible text near it. */
export interface SliderUnavailable {
  /** The `id` of the visible text that says why: "Turn on See-through panels first." */
  readonly reason: string;
}

export interface SliderProps {
  readonly min: number;
  readonly max: number;
  /** 1 unless given. */
  readonly step?: number;
  /** Where the thumb is. A failed save puts it back by passing the old value. */
  readonly value: number;
  /**
   * Called with every value while it moves, so the screen can show it at once. The screen passes
   * it back as `value`; otherwise the thumb stays where it was.
   */
  readonly onChange: (value: number) => void;
  /**
   * Called to save: once when a drag lets go, and on every arrow key, Page Up or Down, Home and
   * End, because each one is a pick.
   */
  readonly onCommit: (value: number) => void;
  /** The value as shown and as screen readers say it: `(v) => \`${v}%\``. */
  readonly format: (value: number) => string;
  /**
   * It can't be used now. It stays focusable and keeps its value, ignores drags and keys, and
   * points screen readers at the reason. There's no `disabled` prop on purpose (component specs
   * 23, A1).
   */
  readonly unavailable?: SliderUnavailable | undefined;
  readonly ref?: Ref<HTMLInputElement>;
}

/** The keys a range input moves by. An unavailable slider swallows them. */
const MOVING_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/** How far along the range `value` is, 0 to 100, for the filled part of the track. */
export function sliderFill(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** 45%, 60% with more contrast, and full strength (`GrayText`) in high contrast. */
const unavailableClasses = "opacity-45 contrast-more:opacity-60 forced-colors:opacity-100";

/**
 * Calls `onCommit` on the browser's own `change`, which fires when a drag lets go and on every key
 * step: exactly when a pick is saved. React's onChange is the `input` event, so it can't tell.
 * Returns the ref the range input needs.
 */
function useCommitOnChange(
  onCommit: (value: number) => void,
  isUnavailable: boolean,
): RefObject<HTMLInputElement | null> {
  const input = useRef<HTMLInputElement | null>(null);
  const latest = useRef({ onCommit, isUnavailable });
  latest.current = { onCommit, isUnavailable };
  useEffect(() => {
    const element = input.current;
    if (element === null) {
      return;
    }
    const commit = () => {
      if (!latest.current.isUnavailable) {
        latest.current.onCommit(Number(element.value));
      }
    };
    element.addEventListener("change", commit);
    return () => element.removeEventListener("change", commit);
  }, []);
  return input;
}

/** Keeps an unavailable slider still: no drag starts and the keys that move it do nothing. */
const holdStill = {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
    if (MOVING_KEYS.has(event.key)) {
      event.preventDefault();
    }
  },
  onPointerDown: (event: PointerEvent<HTMLInputElement>) => {
    event.preventDefault();
  },
};

/**
 * A value picked along a range that applies at once: Appearance's panel opacity. A native range
 * input drawn by the kit (`slider`, in slider.css), 32px high and 48px on a phone, with the
 * value to its right. Put it in a `Field`, whose label names it.
 *
 * @example
 * <Field label="Panel opacity">
 *   <Slider min={10} max={100} step={5} value={opacity} onChange={setOpacity}
 *     onCommit={saveOpacity} format={(v) => `${v}%`} />
 * </Field>
 */
export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  onCommit,
  format,
  unavailable,
  ref,
}: SliderProps) {
  const field = useFieldControl();
  const isUnavailable = unavailable !== undefined;
  const input = useCommitOnChange(onCommit, isUnavailable);
  const shown = format(value);
  const style = { "--slider-fill": `${sliderFill(value, min, max)}%` } as CSSProperties;

  return (
    <div className={`flex items-center gap-3 ${isUnavailable ? unavailableClasses : ""}`}>
      <input
        type="range"
        ref={(element) => {
          input.current = element;
          assignRef(ref, element);
        }}
        id={field?.id}
        min={min}
        max={max}
        step={step}
        value={value}
        style={style}
        aria-valuetext={shown}
        aria-disabled={isUnavailable ? true : undefined}
        aria-invalid={field?.invalid === true ? true : undefined}
        aria-describedby={describedBy(unavailable?.reason, field?.describedBy)}
        className="slider h-control-md min-w-0 flex-1 phone:h-touch"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          // React puts `value` back from the prop, so an unavailable slider only reports nothing.
          if (!isUnavailable) {
            onChange(Number(event.target.value));
          }
        }}
        {...(isUnavailable ? holdStill : {})}
      />
      <span
        aria-hidden="true"
        className={`min-w-[4ch] text-right text-body tabular-nums ${isUnavailable ? "text-fg-disabled text-forced-disabled" : "text-fg"}`}
      >
        {shown}
      </span>
    </div>
  );
}
