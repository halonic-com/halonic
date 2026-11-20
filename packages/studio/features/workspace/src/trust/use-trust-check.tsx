import type { ToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { TrustAnswer } from "./trust-asks.ts";
import { TrustCheckDialog } from "./trust-check-dialog.tsx";
import type { WorkspaceTrustControl } from "./workspace-trust-control.ts";

/** What {@link useTrustCheck} gives the control that opens the check. */
export interface TrustCheckFlow {
  /** Opens the check for what the workspace holds now; does nothing before the first answer. */
  readonly open: () => void;
  /**
   * Opens the check for a start that asked for it, and answers `"trusted"` once the person
   * trusted the workspace, `"declined"` on Not now; at once `"declined"` when there's nothing to show.
   */
  readonly ask: () => Promise<TrustAnswer>;
  /** The open check, or nothing: render it once, anywhere in the control's tree. */
  readonly dialog: ReactNode;
}

/**
 * The trust check as a flow, for the controls that open it (the header badge and the workspace
 * page's **Review**): **Not now** closes it with nothing saved, **Trust** saves the person's trust
 * in exactly the fingerprint shown and says "Acme can run now"; a failed save keeps it open.
 *
 * @param returnFocus - the control to give focus back to when the check closes
 *
 * @example
 * const check = useTrustCheck(trust, "Acme", toasts, () => button.current);
 * <button onClick={check.open}>Review</button>{check.dialog}
 */
export function useTrustCheck(
  trust: WorkspaceTrustControl,
  name: string,
  toasts: ToastStore,
  returnFocus: () => HTMLElement | null,
): TrustCheckFlow {
  const review = useSyncExternalStore(
    (onChange) => trust.subscribe(onChange),
    () => trust.review(),
  );
  const [opened, setOpened] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Whoever asked for the open check, answered once when it closes.
  const answer = useRef<((answer: TrustAnswer) => void) | undefined>(undefined);
  useEffect(() => () => answer.current?.("declined"), []);

  const close = (said: TrustAnswer) => {
    setOpened(undefined);
    setBusy(false);
    setError(undefined);
    const asked = answer.current;
    answer.current = undefined;
    asked?.(said);
  };
  const trustIt = async (fingerprint: string) => {
    setBusy(true);
    setError(undefined);
    const result = await trust.grant(fingerprint);
    if (result.ok) {
      close("trusted");
      toasts.show({ tone: "success", title: `${name} can run now` });
      return;
    }
    setBusy(false);
    setError(`Couldn't save trust: ${result.reason}. Nothing was started.`);
  };
  const open = () => review !== undefined && setOpened(review.fingerprint);
  return {
    open,
    ask: () => {
      if (review === undefined) return Promise.resolve("declined");
      answer.current?.("declined");
      open();
      return new Promise((resolve) => {
        answer.current = resolve;
      });
    },
    dialog:
      opened === undefined || review === undefined ? null : (
        <TrustCheckDialog
          review={review}
          shown={opened}
          busy={busy}
          error={error}
          onNotNow={() => close("declined")}
          onTrust={() => void trustIt(review.fingerprint)}
          returnFocus={returnFocus}
        />
      ),
  };
}
