import type { ReactNode } from "react";
import { ChevronDownIcon } from "../icons/chevron-down-icon.tsx";
import { DashedRingIcon } from "../icons/dashed-ring-icon.tsx";
import { InfoIcon } from "../icons/info-icon.tsx";
import { Menu, type MenuEntry, type MenuTriggerProps } from "../menu/menu.tsx";
import { usePresentation } from "../presentation/presentation.tsx";

/** The sample chip: it opens a Menu, or on a phone the panel sheet with the same items. */
export interface HeaderBadgeMenu {
  readonly as: "menu";
  /** The badge's words: "Sample · test model". */
  readonly children: string;
  /** The menu's first line: "Runs on the built-in test model, with scripted replies. No key, no cost." */
  readonly description?: string | undefined;
  readonly entries: readonly MenuEntry[];
  /**
   * On a phone, where the badge opens a panel sheet instead of a Menu. The sheet is a page on the
   * shell's stack, so the shell opens it (component specs 15.3, 20.1).
   */
  readonly onOpenSheet: () => void;
}

/** The trust badge: it opens the trust check, not a menu. */
export interface HeaderBadgeButton {
  readonly as: "button";
  /** The state, in `fg-muted`: "Not trusted yet". */
  readonly children: string;
  /** Where it leads, in `accent-text` after a middle dot: "Review". */
  readonly action: string;
  /**
   * Its name, when it isn't the words with a full stop between them ("Not trusted yet. Review"):
   * on a phone, where it opens Settings › Trust, "Not trusted yet. Open trust settings".
   */
  readonly label?: string | undefined;
  readonly onClick: () => void;
}

/** The props of `HeaderBadge`. */
export type HeaderBadgeProps = HeaderBadgeMenu | HeaderBadgeButton;

/**
 * The neutral Status chip's look, 24px high so it's a usable target in the 40px title bar.
 * Always neutral, never `warning`. Hover steps the fill up to `border`. The open ring is 2px
 * `accent`, not the focus ring: while the Menu is open the focus is in it. Its edge is
 * see-through so high contrast draws it, and `border-control` with more contrast (23.5).
 */
const badgeClasses = [
  "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs",
  "border border-transparent bg-surface-muted text-caption text-fg-muted",
  "transition-colors hover:bg-border hover:text-fg focus-ring",
  "contrast-more:border-border-control",
  "aria-expanded:shadow-[0_0_0_2px_var(--color-accent)]",
  "forced-colors:aria-expanded:outline-2 forced-colors:aria-expanded:outline-solid",
  // On a phone it wraps at large text instead of being cut; its 48px line grows with it.
  "phone:h-auto phone:min-h-6 phone:whitespace-normal phone:hit-touch",
].join(" ");

const padding = { menu: "pr-1.5 pl-2", button: "px-2" } as const;

/**
 * The sample chip's look, for another Menu trigger drawn as a header badge: the narrow window's
 * "3 open tabs ▾" in the title bar (VK T2-F43). It brings its own words and ▾.
 */
export const headerBadgeMenuClasses = `${badgeClasses} ${padding.menu}`;

const iconSlot = "inline-grid size-3.5 shrink-0 place-items-center *:size-full";

/** On a phone the badge has its own 48px line in More, under the workspace row (20.1). */
const phoneLine = "flex min-h-touch items-center border-b border-border px-4 py-1";

/**
 * The badge in the title bar's header slot: the sample chip (`as="menu"`) or the trust badge
 * (`as="button"`). A real button drawn as a neutral Status chip, so it reads as a state but can be
 * clicked. The slot holds one at a time; the trust badge wins (component specs 20.1).
 *
 * On a phone it sits on its own 48px line, which the shell puts under the workspace row in More.
 * There the sample chip calls `onOpenSheet` instead of opening a Menu.
 *
 * @example
 * <HeaderBadge as="menu" description={costLine} entries={sampleEntries} onOpenSheet={openSheet}>
 *   Sample · test model
 * </HeaderBadge>
 * <HeaderBadge as="button" action="Review" onClick={openTrustCheck}>Not trusted yet</HeaderBadge>
 */
export function HeaderBadge(props: HeaderBadgeProps) {
  const phone = usePresentation() === "phone";
  const badge =
    phone || props.as === "button" ? <PlainBadge props={props} /> : <MenuBadge props={props} />;
  return phone ? <div className={phoneLine}>{badge}</div> : badge;
}

/** The trust badge, or the sample chip on a phone: a button that opens no menu. */
function PlainBadge({ props }: { readonly props: HeaderBadgeProps }) {
  if (props.as === "menu") {
    return (
      <button type="button" className={headerBadgeMenuClasses} onClick={props.onOpenSheet}>
        <MenuBadgeBody text={props.children} />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`${badgeClasses} ${padding.button}`}
      aria-label={props.label ?? `${props.children}. ${props.action}`}
      onClick={props.onClick}
    >
      <Icon>
        <DashedRingIcon />
      </Icon>
      <span>
        {props.children} · <span className="text-accent-text">{props.action}</span>
      </span>
    </button>
  );
}

/** The sample chip on desktop: the trigger of a Menu lined up with its right edge, 4px below. */
function MenuBadge({ props }: { readonly props: HeaderBadgeMenu }) {
  return (
    <Menu
      align="end"
      description={props.description}
      entries={props.entries}
      trigger={(trigger: MenuTriggerProps) => (
        <button type="button" {...trigger} className={headerBadgeMenuClasses}>
          <MenuBadgeBody text={props.children} />
        </button>
      )}
    />
  );
}

function MenuBadgeBody({ text }: { readonly text: string }) {
  return (
    <>
      <Icon>
        <InfoIcon />
      </Icon>
      <span>{text}</span>
      <Icon>
        <ChevronDownIcon />
      </Icon>
    </>
  );
}

function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <span className={iconSlot} aria-hidden="true">
      {children}
    </span>
  );
}
