import { useModalOpen } from "@halonicjs/studio-kit";
import type { BadgeRegistry, WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const openTrustCommand = "workspace.open-trust";
/** The workspace feature's header badge, "Not trusted yet · Review", that opens the trust check. */
const trustBadgeId = "workspace-trust";

/** What a card needs for an answer refused because the workspace isn't trusted. */
export interface TrustReview {
  /**
   * Opens the workspace's trust check, for **Review**, with the button to give focus back to;
   * without it that line has no button.
   */
  readonly review: ((opener: HTMLElement | null) => void) | undefined;
  /**
   * How often the workspace became trusted while the Inbox was open: when it changes, a card that
   * said the workspace isn't trusted drops that line (HAL-14007 TU2).
   */
  readonly granted: number;
}

/**
 * **Review** on a card refused in a workspace that isn't trusted: the trust check that the header
 * badge "Not trusted yet · Review" opens, as on More, given the button to give focus back to.
 * Without the badge it opens Settings › Trust; `undefined` when the window can do neither.
 */
export function trustReviewOf({
  badges,
  runCommand,
}: Pick<WorkspaceContext, "badges" | "runCommand">):
  | ((opener: HTMLElement | null) => void)
  | undefined {
  if (badges === undefined && runCommand === undefined) return undefined;
  return (opener) => {
    const badge = badges?.list().find((shown) => shown.id === trustBadgeId);
    if (badge?.onSelect === undefined) runCommand?.(openTrustCommand);
    else badge.onSelect(opener);
  };
}

/**
 * The window's {@link TrustReview}: **Review** as {@link trustReviewOf}, and a count that goes up
 * each time the trust badge leaves the header, which it does once the workspace is trusted.
 */
export function useTrustReview(
  context: Pick<WorkspaceContext, "badges" | "runCommand">,
): TrustReview {
  const granted = useTrustGranted(context.badges);
  return { review: trustReviewOf(context), granted };
}

const noBadges = () => () => undefined;

function useTrustGranted(badges: BadgeRegistry | undefined): number {
  const shown = useSyncExternalStore(
    badges === undefined ? noBadges : (onChange) => badges.subscribe(onChange),
    () => badges?.list().some((badge) => badge.id === trustBadgeId) ?? false,
  );
  const [granted, setGranted] = useState(0);
  const was = useRef(shown);
  useEffect(() => {
    if (was.current && !shown) setGranted((count) => count + 1);
    was.current = shown;
  }, [shown]);
  return granted;
}

/**
 * Drops a card's "This workspace isn't trusted yet" line once the workspace is trusted, and gives
 * focus to the card's first answer, so it can be sent now (HAL-14007 TU2). Focus moves once the
 * trust check has closed, since closing gives focus back to **Review**, which is gone by then.
 *
 * @param trust - the card's {@link TrustReview}; without it the line stays
 * @param untrusted - whether the card shows that line now
 * @param clear - drops the line
 * @param first - the answer to focus: Approve, or a wait card's first answer
 */
export function useClearedWhenTrusted(
  trust: TrustReview | undefined,
  untrusted: boolean,
  clear: () => void,
  first: () => HTMLElement | null,
): void {
  const granted = trust?.granted ?? 0;
  const modalOpen = useModalOpen();
  const [refocus, setRefocus] = useState(false);
  const seen = useRef(granted);
  useEffect(() => {
    if (seen.current === granted) return;
    seen.current = granted;
    if (!untrusted) return;
    clear();
    setRefocus(true);
  }, [granted, untrusted, clear]);
  useEffect(() => {
    if (!refocus || modalOpen) return;
    setRefocus(false);
    first()?.focus();
  }, [refocus, modalOpen, first]);
}

/** Whether an open card shows the line "This workspace isn't trusted yet". */
export function showsUntrusted(state: { readonly kind: string; readonly untrusted?: boolean }) {
  return state.kind === "open" && state.untrusted === true;
}

/** An open card without its untrusted line and the failure that brought it. */
export function withoutUntrusted<State extends { readonly kind: string }>(state: State): State {
  return state.kind === "open" ? { ...state, failed: null, untrusted: false } : state;
}
