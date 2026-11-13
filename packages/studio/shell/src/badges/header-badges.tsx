import { HeaderBadge, StatusChip, Tooltip } from "@halonicjs/studio-kit";
import { useRef, useSyncExternalStore } from "react";
import type { BadgeRegistry, BadgeState } from "./badge-registry.ts";

/** The header badges the features registered, in priority order; nothing when there are none. */
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
  const badge =
    action === undefined || onSelect === undefined ? (
      <StatusChip tone={state.tone}>{state.label}</StatusChip>
    ) : (
      <span
        ref={(element) => {
          opener.current = element?.querySelector("button") ?? null;
        }}
        className="inline-flex"
      >
        <HeaderBadge
          as="button"
          action={action}
          label={`${state.label}. ${action}`}
          onClick={() => onSelect(opener.current)}
        >
          {state.label}
        </HeaderBadge>
      </span>
    );
  return tooltip === undefined ? badge : <Tooltip text={tooltip}>{() => badge}</Tooltip>;
}
