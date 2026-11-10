import type { ChangeEvent, FocusEvent, ReactNode, Ref } from "react";
import { assignRef, describedBy } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";

/** Why a switch can't be used right now, written as visible text near it. */
export interface SwitchUnavailable {
  /** The `id` of the visible text that says why: "Finish getting updates first." */
  readonly reason: string;
}

interface SwitchBase {
  /** On or off. */
  readonly checked: boolean;
  /** Called with the new value. Not called while `unavailable`. */
  readonly onChange: (checked: boolean) => void;
  /**
   * It can't be used now. It stays focusable and keeps its value, ignores clicks and Space, and
   * points screen readers at the reason. There's no `disabled` prop on purpose (component specs
   * 23, A1).
   */
  readonly unavailable?: SwitchUnavailable | undefined;
  readonly onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  readonly ref?: Ref<HTMLInputElement>;
}

/** A switch with its sentence: "Send a summary every morning". The sentence is the target too. */
interface SwitchWithText extends SwitchBase {
  readonly children: ReactNode;
  readonly label?: never;
}

/** A switch without words of its own: its name says what it turns on. */
interface SwitchWithLabel extends SwitchBase {
  /** "Turn on Sorter". */
  readonly label: string;
  readonly children?: never;
}

/** The props of `Switch`. */
export type SwitchProps = SwitchWithText | SwitchWithLabel;

/**
 * The 32×18 track: a native checkbox without its own look, so the browser keeps its keyboard and
 * screen reader behaviour. Off is `surface-muted` with a `border-control` edge, on is `primary`.
 * The pointer over the track or over a `group/switch` round it (its sentence) turns the edge
 * `fg-muted`, or an on track `primary-hover`. Only colours change, in `--duration-fast`.
 * In high contrast `switch-forced` fills an on track `Highlight`.
 */
const trackShared = [
  "peer m-0 h-4.5 w-8 shrink-0 cursor-pointer appearance-none rounded-full border",
  "border-border-control bg-surface-muted transition-colors focus-ring switch-forced",
  "checked:border-primary checked:bg-primary",
].join(" ");

const trackHover = [
  "hover:border-fg-muted group-hover/switch:border-fg-muted",
  "checked:hover:border-primary-hover checked:hover:bg-primary-hover",
  "checked:group-hover/switch:border-primary-hover checked:group-hover/switch:bg-primary-hover",
].join(" ");

/**
 * The 14px thumb, 2px inside the track: `on-primary`, which is the spec's white `surface` in
 * light and `on-primary` in dark. It jumps from one end to the other; it doesn't slide (v0.1).
 */
const thumbClasses =
  "pointer-events-none absolute top-0.5 left-0.5 size-3.5 rounded-full bg-on-primary peer-checked:left-4";

/** 45%, 60% with more contrast, and `GrayText` at full strength in high contrast. */
const unavailableClasses =
  "cursor-not-allowed opacity-45 contrast-more:opacity-60 forced-colors:opacity-100";

/**
 * A setting that is on or off and applies at once: "Send a summary every morning". On desktop the
 * sentence comes first and the switch sits at the end of a row of at most 360px, so it stays near
 * its words; on a phone the row is the whole width, at least 48px high, with the switch at the
 * right edge. In a Field it's described by the Field's line, where a failed save says so.
 *
 * @example
 * <Switch checked={summary} onChange={setSummary}>Send a summary every morning</Switch>
 * <Switch label="Turn on Sorter" checked={on} onChange={setOn} />
 */
export function Switch(props: SwitchProps) {
  const { checked, onChange, unavailable, onFocus, ref } = props;
  const field = useFieldControl();
  const isUnavailable = unavailable !== undefined;

  const inside = (
    <span className={`relative inline-flex shrink-0 ${isUnavailable ? unavailableClasses : ""}`}>
      <input
        type="checkbox"
        role="switch"
        // The native box already says on or off; Biome asks for it on the role as well.
        aria-checked={checked}
        ref={(element) => assignRef(ref, element)}
        // With a sentence of its own the switch is named by it, not by the Field's label as well.
        id={props.children === undefined ? field?.id : undefined}
        checked={checked}
        aria-label={props.label}
        aria-disabled={isUnavailable ? true : undefined}
        aria-describedby={describedBy(unavailable?.reason, field?.describedBy)}
        className={`${trackShared} ${isUnavailable ? "cursor-not-allowed" : trackHover}`}
        // A click or Space has already flipped the box; React puts `checked` back from the prop,
        // so an unavailable switch only has to report nothing.
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          if (!isUnavailable) {
            onChange(event.target.checked);
          }
        }}
        onFocus={onFocus}
      />
      <span aria-hidden="true" className={thumbClasses} />
    </span>
  );
  const cursor = isUnavailable ? "cursor-not-allowed" : "cursor-pointer";

  if (props.children === undefined) {
    // Without words the switch is still a 48px target on a phone or a touch screen. The target is
    // the label's ::after, and a label passes its clicks on to the switch.
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `inside`, which Biome can't see; aria-label names it
      <label className={`relative inline-flex shrink-0 phone:hit-touch touch:hit-touch ${cursor}`}>
        {inside}
      </label>
    );
  }
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is inside `inside`, which Biome can't see
    <label
      className={`group/switch flex w-full max-w-90 items-center justify-between gap-3 text-body phone:max-w-none phone:min-h-touch touch:min-h-touch ${cursor} ${isUnavailable ? "text-fg-disabled text-forced-disabled" : "text-fg"}`}
    >
      <span className="min-w-0">{props.children}</span>
      {inside}
    </label>
  );
}
