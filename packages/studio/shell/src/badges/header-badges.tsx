import {
  HeaderBadge,
  type HeaderBadgePhoneLine,
  StatusChip,
  Tooltip,
  type TooltipTriggerProps,
} from "@halonicjs/studio-kit";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { focusPageHeading } from "../tabs/history-moves.ts";
import { type BadgeRegistry, type BadgeState, trustBadgePriority } from "./badge-registry.ts";

/** The props of {@link HeaderBadges}. */
export interface HeaderBadgesProps {
  readonly registry: BadgeRegistry;
  /**
   * `bar`, the default: one after another, for the desktop's status bar. `strip`: rows of the
   * phone's notice strip, the trust badge on its own line, then the other states as chips in one
   * row that wraps.
   */
  readonly layout?: "bar" | "strip";
}

/**
 * The header badges the features registered, in priority order; nothing when there are none. The
 * status bar shows them, and More in a desktop window as narrow as a phone. A badge that goes while
 * it has focus, as "Not trusted yet · Review" does once the workspace is trusted, gives focus to the
 * page's `h1`, so the next Tab doesn't start from the top (C144 TR1).
 */
export function HeaderBadges({ registry, layout = "bar" }: HeaderBadgesProps) {
  const states = useSyncExternalStore(
    (onChange) => registry.subscribe(onChange),
    () => registry.list(),
  );
  if (layout === "strip") {
    return <StripRows states={states} />;
  }
  return (
    <>
      {states.map((state) => (
        <RegisteredBadge key={state.id} state={state} />
      ))}
    </>
  );
}

/**
 * The strip's rows (HAL-12557): the trust badge on the kit's phone line, indented 16px, then the
 * connector states in one row of chips, 8px apart, that wraps. Each row draws the line under it,
 * so the last row's line is the strip's. In a short window the rows are left out, so the page
 * keeps its room; the save problem's row stays.
 */
function StripRows({ states }: { readonly states: readonly BadgeState[] }) {
  const lines = states.filter((state) => state.priority >= trustBadgePriority);
  const chips = states.filter((state) => state.priority < trustBadgePriority);
  return (
    <>
      {lines.map((state) => (
        <div key={state.id} data-notice-row="" className={stripRow}>
          <RegisteredBadge state={state} phoneLine="strip" />
        </div>
      ))}
      {chips.length > 0 ? (
        <div
          data-notice-row=""
          className={`${stripRow} flex min-h-11 flex-wrap items-center gap-2 px-4 py-2`}
        >
          {chips.map((state) => (
            <RegisteredBadge key={state.id} state={state} phoneLine="none" />
          ))}
        </div>
      ) : null}
    </>
  );
}

const stripRow = "border-b border-border bg-surface-subtle short:hidden";

function RegisteredBadge({
  state,
  phoneLine,
}: {
  readonly state: BadgeState;
  readonly phoneLine?: HeaderBadgePhoneLine;
}) {
  const opener = useRef<HTMLElement | null>(null);
  // Layout cleanup runs before React takes the button out, so it still knows it had focus.
  useLayoutEffect(
    () => () => {
      if (opener.current !== null && opener.current === document.activeElement) {
        focusPageHeading();
      }
    },
    [],
  );
  const { action, onSelect, tooltip } = state;
  // The tooltip's trigger props go on the button, so a screen reader reads what it says too.
  const badge = (trigger: TooltipTriggerProps = {}) =>
    action === undefined || onSelect === undefined ? (
      <StatusChip tone={state.tone}>{state.label}</StatusChip>
    ) : (
      <span
        ref={(element) => {
          // Kept when React lets go of the span, for the check above when the badge goes.
          if (element !== null) opener.current = element.querySelector("button");
        }}
        // On a phone a badge on its own line runs full width, so its divider does too; a chip in
        // the strip's row stays its own size, so the row wraps.
        className={
          phoneLine === "none" ? "inline-flex" : "inline-flex phone:flex phone:grow phone:flex-col"
        }
      >
        <HeaderBadge
          as="button"
          action={action}
          label={`${asSentence(state.label)} ${action}`}
          aria-describedby={trigger["aria-describedby"]}
          phoneLine={phoneLine}
          onClick={() => onSelect(opener.current)}
        >
          {state.label}
        </HeaderBadge>
      </span>
    );
  return tooltip === undefined ? badge() : <Tooltip text={tooltip}>{badge}</Tooltip>;
}

/** The label as a sentence before the action: a full stop, unless it already ends a sentence. */
function asSentence(label: string): string {
  return /[.!?]$/.test(label) ? label : `${label}.`;
}
