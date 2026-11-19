import { HeaderBadge, StatusChip, Tooltip, type TooltipTriggerProps } from "@halonicjs/studio-kit";
import { useRef, useSyncExternalStore } from "react";
import type { BadgeRegistry, BadgeState } from "./badge-registry.ts";

/**
 * The header badges the features registered, in priority order; nothing when there are none. The
 * status bar shows them, and More in a desktop window as narrow as a phone.
 */
export function HeaderBadges({ registry }: { readonly registry: BadgeRegistry }) {
  const states = useSyncExternalStore(
    (onChange) => registry.subscribe(onChange),
    () => registry.list(),
  );
  return (
    <>
      {states.map((state) => (
        <RegisteredBadge key={state.id} state={state} />
      ))}
    </>
  );
}

function RegisteredBadge({ state }: { readonly state: BadgeState }) {
  const opener = useRef<HTMLElement | null>(null);
  const { action, onSelect, tooltip } = state;
  // The tooltip's trigger props go on the button, so a screen reader reads what it says too.
  const badge = (trigger: TooltipTriggerProps = {}) =>
    action === undefined || onSelect === undefined ? (
      <StatusChip tone={state.tone}>{state.label}</StatusChip>
    ) : (
      <span
        ref={(element) => {
          opener.current = element?.querySelector("button") ?? null;
        }}
        // On a phone the badge has its own line on More, so its divider runs full width.
        className="inline-flex phone:flex phone:grow phone:flex-col"
      >
        <HeaderBadge
          as="button"
          action={action}
          label={`${asSentence(state.label)} ${action}`}
          aria-describedby={trigger["aria-describedby"]}
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
