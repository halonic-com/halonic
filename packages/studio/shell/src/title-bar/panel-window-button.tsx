import { SparkIcon, Tooltip } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { hintKeys } from "../points/key-hints.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";

/** Props for {@link PanelWindowButton}. */
export interface PanelWindowButtonProps {
  /** The panel's title, the button's words: "Assistant". */
  readonly title: string;
  /** The shortcut the panel's feature binds, such as "Ctrl+Alt+I"; without it, no hint. */
  readonly keys?: string | undefined;
  readonly platform: KeyboardPlatform;
  readonly open: boolean;
  /** The panel's `id`. */
  readonly controls: string;
  readonly onToggle: () => void;
  readonly ref: RefObject<HTMLButtonElement | null>;
}

/**
 * The side panel's button at the title bar's right end (`shell.title-bar`, component specs 21.1):
 * a 28px ghost toggle with the kit's `SparkIcon` (✦) in `accent` and the panel's title, `aria-expanded` and
 * `aria-controls`. Open, it has the `accent-soft` fill and `accent-text`. Its tooltip is the
 * title with the shortcut's Kbd hint, Ctrl Alt I or ⌃⌥I on macOS, which it names in
 * `aria-keyshortcuts`.
 *
 * @example
 * <PanelWindowButton title="Assistant" keys="Ctrl+Alt+I" platform="windows" open={false} controls={id} onToggle={toggle} ref={button} />
 */
export function PanelWindowButton(props: PanelWindowButtonProps) {
  const keys = props.keys === undefined ? undefined : hintKeys(props.keys, props.platform);
  return (
    <Tooltip text={props.title} {...(keys === undefined ? {} : { keys })} isName>
      {(tooltip) => (
        <button
          {...tooltip}
          ref={props.ref}
          type="button"
          aria-expanded={props.open}
          aria-controls={props.controls}
          className={`${buttonClasses} ${props.open ? openClasses : closedClasses}`}
          onClick={props.onToggle}
        >
          {/* An icon, not the ✦ character: Inter lacks it, so each system drew its own (HAL-16927). */}
          <span
            aria-hidden="true"
            className="inline-grid size-icon-sm shrink-0 text-accent *:size-full"
          >
            <SparkIcon />
          </span>
          {props.title}
        </button>
      )}
    </Tooltip>
  );
}

const buttonClasses = [
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-small font-medium",
  "outline-none focus-ring",
].join(" ");
const closedClasses = "text-fg-muted hover:bg-surface-muted";
const openClasses = "bg-accent-soft text-accent-text";
