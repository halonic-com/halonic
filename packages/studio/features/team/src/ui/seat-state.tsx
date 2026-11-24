import type { SeatState } from "@halonicjs/ports";
import { AlertIcon, InfoIcon, type StatusChipTone, WarningIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";

/**
 * Each state's tone, as the kit's tones mean them (HAL-17515 s01, s06): near its limit is "have a
 * look"; full and signed out both stop the seat's agents, so both are danger; a seat not read is
 * only unknown. The chip and the Needs you row's icon both take their tone from here, so one seat
 * never shows in two colours.
 */
export const stateTones: Record<SeatState, StatusChipTone> = {
  ok: "success",
  "near-limit": "attention",
  full: "danger",
  "signed-out": "danger",
  "not-read": "neutral",
  other: "neutral",
};

/** The text colour of each tone, for an icon outside a chip. */
const toneText: Partial<Record<StatusChipTone, string>> = {
  success: "text-success",
  attention: "text-attention",
  danger: "text-danger",
};

/**
 * Each state's symbol, so a state never rests on colour alone (s06: "every seat state has its
 * symbol and its word"). OK has none: the chip's dot stands for it. The kit has no ⊖ or sign-out
 * icon yet, so full and signed out share the alert icon until it does.
 */
const stateIcons: Record<SeatState, (() => ReactNode) | undefined> = {
  ok: undefined,
  "near-limit": () => <WarningIcon />,
  full: () => <AlertIcon />,
  "signed-out": () => <AlertIcon />,
  "not-read": () => <InfoIcon />,
  other: undefined,
};

/**
 * A state's symbol, hidden from screen readers since the state's words follow it. Inside a chip it
 * takes the chip's colour; on its own (`coloured`) it takes the state's tone.
 */
export function StateIcon(props: { state: SeatState; coloured?: boolean; className?: string }) {
  const icon = stateIcons[props.state];
  if (icon === undefined) return null;
  const colour =
    props.coloured === true ? (toneText[stateTones[props.state]] ?? "text-fg-muted") : "";
  const size = props.className ?? "size-3";
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 *:size-full ${size} ${colour}`}>
      {icon()}
    </span>
  );
}
