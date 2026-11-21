import { Button, DashedRingIcon, Dialog, type ToastStore } from "@halonicjs/studio-kit";
import {
  copyDetailsWords,
  detailsOf,
  engineReasonFor,
  engineWordsOf,
  isUnexplained,
  useCopyDetailsInPlace,
} from "@halonicjs/studio-shell";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import {
  changedSince,
  LOADING_LINE,
  loadFailed,
  NOT_TRUSTED_LINE,
  NOTHING_TO_TRUST_LINE,
  REMOVE_TRUST,
  REMOVE_TRUST_BODY,
  REMOVING,
  REVIEW,
  REVIEW_CHANGES,
  removedToast,
  removeFailed,
  removeTrustTitle,
  TRUST_HEADING,
  TRY_AGAIN,
  trustedOn,
  UNREADABLE_LINE,
} from "./trust-section-text.ts";
import { useTrustCheck } from "./use-trust-check.tsx";
import type { TrustGrantResult, WorkspaceTrustControl } from "./workspace-trust-control.ts";

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
  // For an internal error only: what **Copy details** puts on the clipboard (microcopy 22 F13).
  const [details, setDetails] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const copyDetails = useCopyDetailsInPlace();

  const confirmRemove = async () => {
    setBusy(true);
    setRemoveError(undefined);
    setDetails(undefined);
    const result = await trust.remove();
    setBusy(false);
    if (result.ok) {
      setRemoving(false);
      toasts.show({ tone: "success", title: removedToast(name) });
      // The button changes from Remove trust to Review; focus goes where it was.
      queueMicrotask(() => action.current?.focus());
      return;
    }
    const line = removeFailed(name, reasonOf(result));
    setRemoveError(line);
    if (result.error !== undefined && isUnexplained(result.error)) {
      setDetails(detailsOf(line, result.error));
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      data-workspace-section="trust"
      className="flex flex-col gap-3"
    >
      <h2 id={headingId} tabIndex={-1} className="text-heading">
        {TRUST_HEADING}
      </h2>
      {status === "unknown" ? (
        <p className="m-0 text-fg-muted">{LOADING_LINE}</p>
      ) : (
        <div className="flex items-start gap-2">
          <StatusMark status={status} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="m-0">{statusLine(status, trustedAt, trust)}</p>
            <div>
              {status === "trusted" ? (
                <Button
                  ref={action}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRemoveError(undefined);
                    setDetails(undefined);
                    setRemoving(true);
                  }}
                >
                  {REMOVE_TRUST}
                </Button>
              ) : null}
              {status === "failed" ? (
                <Button ref={action} size="sm" onClick={() => void trust.retry()}>
                  {TRY_AGAIN}
                </Button>
              ) : null}
              {asksForReview(status, trust) ? (
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
          {...(details === undefined
            ? {}
            : {
                errorAction: {
                  label: copyDetailsWords.label,
                  doneLabel: copyDetailsWords.done,
                  onClick: () => copyDetails(details),
                },
              })}
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

/**
 * Why removing failed, without its closing full stop, as Trusted sources says it: an internal
 * error reads "Halonic ran into a problem it can't explain yet", a refusal that names the problem
 * (`declined`, `busy`, `io`) keeps its own words, and the raw message never shows.
 */
function reasonOf(result: Extract<TrustGrantResult, { ok: false }>): string {
  if (result.error === undefined) return result.reason;
  return engineReasonFor(result.error, engineWordsOf({}).notAnswering).replace(/\.+$/u, "");
}

export function StatusMark({ status }: { readonly status: WorkspaceTrustControl["status"] }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
    >
      {status === "trusted" ? "✓" : <DashedRingIcon />}
    </span>
  );
}

/** Whether **Review** or **Review changes** shows: not for a workspace with nothing to trust, even when its saved record reads `changed`. */
function asksForReview(
  status: WorkspaceTrustControl["status"],
  trust: WorkspaceTrustControl,
): boolean {
  return (status === "changed" || status === "not-trusted") && trust.needsNoTrust !== true;
}

export function statusLine(
  status: WorkspaceTrustControl["status"],
  trustedAt: string | undefined,
  trust: WorkspaceTrustControl,
): string {
  if ((status === "not-trusted" || status === "changed") && trust.needsNoTrust === true) {
    return NOTHING_TO_TRUST_LINE;
  }
  const failure = trust.failure;
  switch (status) {
    case "trusted":
      return trustedAt === undefined ? "Trusted" : trustedOn(trustedAt);
    case "changed":
      return trustedAt === undefined ? "Changed since you trusted it." : changedSince(trustedAt);
    case "list-unreadable":
      return UNREADABLE_LINE;
    case "not-trusted":
      return NOT_TRUSTED_LINE;
    case "failed":
      return loadFailed(failure ?? "unknown error");
    case "unknown":
      return LOADING_LINE;
  }
}
