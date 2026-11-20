import type { ReactNode } from "react";
import { ChevronDownIcon } from "../icons/chevron-down-icon.tsx";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { DashedRingIcon } from "../icons/dashed-ring-icon.tsx";
import { InfoIcon } from "../icons/info-icon.tsx";
import { Menu, type MenuEntry, type MenuTriggerProps } from "../menu/menu.tsx";
import { usePresentation } from "../presentation/presentation.tsx";

/**
 * Where a badge's phone line sits: `more`, under the workspace row in More, indented 60px to its
 * name, with a 1px `border` under it; `strip`, a row of the phone's notice strip, indented 16px
 * with no line of its own, since the strip draws the lines between its rows; `none`, no line, for
 * a badge among the chips of a wrapping row.
 */
export type HeaderBadgePhoneLine = "more" | "strip" | "none";

/** The sample chip: it opens a Menu, or on a phone the panel sheet with the same items. */
export interface HeaderBadgeMenu {
  readonly as: "menu";
  /** Its line on a phone; `more` when left out. */
  readonly phoneLine?: HeaderBadgePhoneLine | undefined;
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
  /** Its line on a phone; `more` when left out. */
  readonly phoneLine?: HeaderBadgePhoneLine | undefined;
  /** The state, in `fg-muted`: "Not trusted yet". */
  readonly children: string;
  /** Where it leads, in `accent-text` after a middle dot: "Review". */
  readonly action: string;
  /**
   * Its name, when it isn't the words with a full stop between them ("Not trusted yet. Review"):
   * on a phone, where it opens Settings › Trust, "Not trusted yet. Open trust settings".
   */
  readonly label?: string | undefined;
  /** The id of what describes it, such as its tooltip's: what trust gates. */
  readonly "aria-describedby"?: string | undefined;
  readonly onClick: () => void;
}

/**
 * How a connection label looks: `success` calm with a green dot, `waiting` calm with an amber dot
 * (reconnecting), `attention` amber (can't connect), `danger` red (removed, can't be trusted).
 */
export type HeaderBadgeStatusTone = "success" | "waiting" | "attention" | "danger";

/** The phone's connection label in its top bar: a state in words that opens its details. */
export interface HeaderBadgeStatus {
  readonly as: "status";
  /** The state, always in words: "Connected · Tim's laptop", "Can't reach your computer". */
  readonly children: string;
  readonly tone: HeaderBadgeStatusTone;
  /** Where it leads, said after the state but not shown (the chevron shows it): "Details". */
  readonly action: string;
  readonly onClick: () => void;
}

/** The props of `HeaderBadge`. */
export type HeaderBadgeProps = HeaderBadgeMenu | HeaderBadgeButton | HeaderBadgeStatus;

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
  // It never gets wider than its line (200 % on a phone is 195px): it shrinks, its words wrap
  // between words, and its icons stay level with the first line. One line stays 24px high:
  // a 1px edge and 3px padding round a 16px line.
  "phone:min-w-0 phone:shrink phone:items-start phone:py-0.75 phone:text-start",
].join(" ");

const padding = { menu: "pr-1.5 pl-2", button: "px-2" } as const;

/**
 * The sample chip's look, for another Menu trigger drawn as a header badge: the narrow window's
 * "3 open tabs ▾" in the title bar (VK T2-F43). It brings its own words and ▾.
 */
export const headerBadgeMenuClasses = `${badgeClasses} ${padding.menu}`;

/** A 14px icon in a slot one caption line high, so it sits level with the first line of words. */
const iconSlot = "inline-grid h-4 w-3.5 shrink-0 place-items-center *:size-3.5";

/**
 * On a phone the badge has its own 48px line in More, under the workspace row and level with its
 * name (20.1). In the notice strip there's no name to line up with, so it takes the strip's 16px.
 */
const phoneLines = {
  more: "flex min-h-touch items-center border-b border-border pe-4 ps-15 py-1",
  strip: "flex min-h-touch items-center pe-4 ps-4 py-1",
} as const;

/**
 * The badge in the title bar's header slot: the sample chip (`as="menu"`) or the trust badge
 * (`as="button"`). A real button drawn as a neutral Status chip, so it reads as a state but can be
 * clicked. The slot holds one at a time; the trust badge wins (component specs 20.1).
 *
 * On a phone it sits on its own 48px line, which the shell puts under the workspace row in More,
 * or with `phoneLine="strip"` in the notice strip under the top bar. There the sample chip calls
 * `onOpenSheet` instead of opening a Menu.
 *
 * `as="status"` is the phone's connection label, which sits in the top bar itself: 32px high with
 * a 48px target, a dot and the state in words, and a chevron to its details. Colour never carries
 * the state alone: the dot is decoration and the words say it.
 *
 * @example
 * <HeaderBadge as="menu" description={costLine} entries={sampleEntries} onOpenSheet={openSheet}>
 *   Sample · test model
 * </HeaderBadge>
 * <HeaderBadge as="button" action="Review" onClick={openTrustCheck}>Not trusted yet</HeaderBadge>
 * <HeaderBadge as="button" action="Review" phoneLine="strip" onClick={openTrustCheck}>
 *   Not trusted yet
 * </HeaderBadge>
 * <HeaderBadge as="status" tone="attention" action="Details" onClick={openDetails}>
 *   Can't reach your computer
 * </HeaderBadge>
 */
export function HeaderBadge(props: HeaderBadgeProps) {
  if (props.as === "status") {
    return <StatusBadge props={props} />;
  }
  const phone = usePresentation() === "phone";
  const badge =
    phone || props.as === "button" ? <PlainBadge props={props} /> : <MenuBadge props={props} />;
  const line = props.phoneLine ?? "more";
  if (!phone || line === "none") {
    return badge;
  }
  return <div className={phoneLines[line]}>{badge}</div>;
}

/** The trust badge, or the sample chip on a phone: a button that opens no menu. */
function PlainBadge({ props }: { readonly props: HeaderBadgeMenu | HeaderBadgeButton }) {
  if (props.as === "menu") {
    return (
      <button
        type="button"
        className={headerBadgeMenuClasses}
        aria-label={spokenOf(props.children)}
        onClick={props.onOpenSheet}
      >
        <MenuBadgeBody text={props.children} />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`${badgeClasses} ${padding.button}`}
      aria-label={props.label ?? `${props.children}. ${props.action}`}
      aria-describedby={props["aria-describedby"]}
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

const statusLooks: Record<HeaderBadgeStatusTone, { readonly fill: string; readonly dot: string }> =
  {
    success: { fill: "bg-surface-muted text-fg", dot: "bg-success" },
    waiting: { fill: "bg-surface-muted text-fg", dot: "bg-attention" },
    attention: { fill: "bg-attention-soft text-attention", dot: "bg-attention" },
    danger: { fill: "bg-danger-soft text-danger", dot: "bg-danger" },
  };

/**
 * The connection label: 32px, radius 8px, `text-body-strong`, wrapping at large text instead of
 * being cut. Its target is 48px high, so it fits the 48px top bar without growing it. Named by its
 * state and where it leads ("Can't reach your computer. Details"). A colour change, not a live
 * region: the screen that owns it announces a change once.
 */
function StatusBadge({ props }: { readonly props: HeaderBadgeStatus }) {
  const look = statusLooks[props.tone];
  return (
    <button
      type="button"
      className={`inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-transparent py-1.5 pr-2 pl-3 text-start text-body-strong transition-colors focus-ring hit-touch contrast-more:border-border-control ${look.fill}`}
      aria-label={`${spokenOf(props.children)}. ${props.action}`}
      onClick={props.onClick}
    >
      {/* In high contrast the fill would turn into the background: the dot keeps its shape in
          the text colour, like the sidebar's running dot (HAL-12946). */}
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${look.dot} forced-color-adjust-none forced-colors:bg-[CanvasText]`}
      />
      <span className="min-w-0">{props.children}</span>
      <Icon>
        <ChevronRightIcon />
      </Icon>
    </button>
  );
}

/** What a screen reader says of a chip's text: the middle dot reads as a comma (microcopy 19.6). */
function spokenOf(text: string): string {
  return text.replaceAll(" · ", ", ");
}

/** The sample chip on desktop: the trigger of a Menu lined up with its right edge, 4px below. */
function MenuBadge({ props }: { readonly props: HeaderBadgeMenu }) {
  return (
    <Menu
      align="end"
      description={props.description}
      entries={props.entries}
      trigger={(trigger: MenuTriggerProps) => (
        <button
          type="button"
          {...trigger}
          aria-label={spokenOf(props.children)}
          className={headerBadgeMenuClasses}
        >
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
