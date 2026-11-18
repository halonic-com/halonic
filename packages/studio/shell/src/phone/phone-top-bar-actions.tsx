import { createContext, type ReactNode, use } from "react";
import { createPortal } from "react-dom";

/**
 * Where a page's top bar buttons go: the top bar's slot, or `null` with no phone top bar. The
 * phone window gives it; a feature's test can give its own element to stand for the top bar.
 */
export const PhoneTopBarSlot = createContext<HTMLElement | null>(null);

/** Props for {@link PhoneTopBarActions}. */
export interface PhoneTopBarActionsProps {
  /** The page's 48px icon buttons: its ⋮ menu, "New agent". */
  readonly children: ReactNode;
}

/**
 * Puts a page's buttons in the phone's top bar, at its right (component specs 15.1). They stay the
 * page's own: they keep its state and go when the page goes. With no phone top bar, on the desktop,
 * it draws nothing, so a page shows its buttons in its own header where `useInPhoneTopBar` is
 * `false`.
 *
 * @example
 * {inTopBar ? <PhoneTopBarActions>{menu}</PhoneTopBarActions> : <header>{menu}</header>}
 */
export function PhoneTopBarActions({ children }: PhoneTopBarActionsProps) {
  const slot = use(PhoneTopBarSlot);
  return slot === null ? null : createPortal(children, slot);
}

/** Whether the page is under a phone top bar that takes its buttons (`PhoneTopBarActions`). */
export function useInPhoneTopBar(): boolean {
  return use(PhoneTopBarSlot) !== null;
}
