import type { ToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { TrustCheckDialog } from "./trust-check-dialog.tsx";
import type { WorkspaceTrustControl } from "./workspace-trust-control.ts";

/** What {@link useTrustCheck} gives the control that opens the check. */
export interface TrustCheckFlow {
  /** Opens the check for what the workspace holds now; does nothing before the first answer. */
  readonly open: () => void;
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

  const close = () => {
    setOpened(undefined);
    setBusy(false);
    setError(undefined);
  };
  const trustIt = async (fingerprint: string) => {
    setBusy(true);
    setError(undefined);
    const result = await trust.grant(fingerprint);
    if (result.ok) {
      close();
      toasts.show({ tone: "success", title: `${name} can run now` });
      return;
    }
    setBusy(false);
    setError(`Couldn't save trust: ${result.reason}. Nothing was started.`);
  };
  return {
    open: () => review !== undefined && setOpened(review.fingerprint),
    dialog:
      opened === undefined || review === undefined ? null : (
        <TrustCheckDialog
          review={review}
          shown={opened}
          busy={busy}
          error={error}
          onNotNow={close}
          onTrust={() => void trustIt(review.fingerprint)}
          returnFocus={returnFocus}
        />
      ),
  };
}
