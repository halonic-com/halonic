import { Button, DashedRingIcon, Dialog, type ToastStore } from "@halonicjs/studio-kit";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import {
  changedSince,
  NOT_TRUSTED_LINE,
  REMOVE_TRUST,
  REMOVE_TRUST_BODY,
  REMOVING,
  REVIEW,
  REVIEW_CHANGES,
  removedToast,
  removeFailed,
  removeTrustTitle,
  TRUST_HEADING,
  trustedOn,
  UNREADABLE_LINE,
} from "./trust-section-text.ts";
import { useTrustCheck } from "./use-trust-check.tsx";
import type { WorkspaceTrustControl } from "./workspace-trust-control.ts";

/** The props of {@link WorkspaceTrustSection}. */
export interface WorkspaceTrustSectionProps {
  readonly trust: WorkspaceTrustControl;
  /** The workspace's name, for the dialog, its failure and the toasts. */
  readonly name: string;
  readonly toasts: ToastStore;
}

/**
 * The **Trust** section of the workspace page (`workspace.trust-section`, states-flow-map
 * P4 to P6, P9 to P11): whether the workspace is trusted and since when, **Review** or **Review
 * changes** when it isn't or has changed (the same check as the header badge), and **Remove
 * trust** in a confirmation when it is. Removing trust deletes the record, so the section then
 * reads "Not trusted yet" and focus goes to **Review**, where the button was.
 *
 * @example
 * <WorkspaceTrustSection trust={opened.trust} name="Acme" toasts={shell.toasts} />
 */
export function WorkspaceTrustSection({ trust, name, toasts }: WorkspaceTrustSectionProps) {
  const status = useSyncExternalStore(
    (onChange) => trust.subscribe(onChange),
    () => trust.status,
  );
  const trustedAt = useSyncExternalStore(
    (onChange) => trust.subscribe(onChange),
    () => trust.trustedAt,
  );
  const headingId = useId();
  const action = useRef<HTMLButtonElement | null>(null);
  const check = useTrustCheck(trust, name, toasts, () => action.current);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const confirmRemove = async () => {
    setBusy(true);
    setRemoveError(undefined);
    const result = await trust.remove();
    setBusy(false);
    if (result.ok) {
      setRemoving(false);
      toasts.show({ tone: "success", title: removedToast(name) });
      // The button changes from Remove trust to Review; focus goes where it was.
      queueMicrotask(() => action.current?.focus());
      return;
    }
    setRemoveError(removeFailed(name, result.reason));
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} tabIndex={-1} className="text-heading">
        {TRUST_HEADING}
      </h2>
      {status === "unknown" ? null : (
        <div className="flex items-start gap-2">
          <StatusMark status={status} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="m-0">{statusLine(status, trustedAt)}</p>
            <div>
              {status === "trusted" ? (
                <Button
                  ref={action}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRemoveError(undefined);
                    setRemoving(true);
                  }}
                >
                  {REMOVE_TRUST}
                </Button>
              ) : null}
              {status === "not-trusted" || status === "changed" ? (
                <Button ref={action} size="sm" onClick={check.open}>
                  {status === "changed" ? REVIEW_CHANGES : REVIEW}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {check.dialog}
      {removing ? (
        <Dialog
          title={removeTrustTitle(name)}
          confirm={{ label: REMOVE_TRUST, variant: "danger", busyLabel: REMOVING }}
          busy={busy}
          {...(removeError === undefined ? {} : { error: removeError })}
          returnFocus={() => action.current}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(false)}
        >
          <p>{REMOVE_TRUST_BODY}</p>
        </Dialog>
      ) : null}
    </section>
  );
}

function StatusMark({ status }: { readonly status: WorkspaceTrustControl["status"] }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
    >
      {status === "trusted" ? "✓" : <DashedRingIcon />}
    </span>
  );
}

function statusLine(
  status: WorkspaceTrustControl["status"],
  trustedAt: string | undefined,
): string {
  switch (status) {
    case "trusted":
      return trustedAt === undefined ? "Trusted" : trustedOn(trustedAt);
    case "changed":
      return trustedAt === undefined ? "Changed since you trusted it." : changedSince(trustedAt);
    case "list-unreadable":
      return UNREADABLE_LINE;
    case "not-trusted":
      return NOT_TRUSTED_LINE;
    case "unknown":
      return "";
  }
}
