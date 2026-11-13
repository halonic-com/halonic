import {
  Callout,
  Checkbox,
  Dialog,
  Disclosure,
  HeaderBadge,
  type ToastStore,
  Tooltip,
} from "@halonicjs/studio-kit";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import type {
  TrustReview,
  TrustRowView,
  TrustSectionView,
  WorkspaceTrustControl,
} from "./workspace-trust-control.ts";

/** What the badge's tooltip says (states-flow-map T2). */
export const notTrustedTooltip =
  "Halonic won't start this workspace's programs or call real models until you review it. You can still read and edit everything.";

/** The tooltip when the list of trusted workspaces can't be read (T4). */
export const unreadableTooltip = "Halonic couldn't read its list of trusted workspaces.";

/** The props of {@link WorkspaceTrustBadge}. */
export interface WorkspaceTrustBadgeProps {
  /** The workspace's trust. */
  readonly trust: WorkspaceTrustControl;
  /** The workspace's name, for the toast: "Acme can run now". */
  readonly name: string;
  /** The window's toasts. */
  readonly toasts: ToastStore;
}

/**
 * The header badge "Not trusted yet · Review" and the trust check it opens (`studio.workspace-trust-ui`,
 * states-flow-map T2 to T6 and K4). Nothing shows while the workspace is trusted or before the
 * first answer. The whole badge is one button; pressing it opens the check, which is the
 * first-time check or "What changed". **Not now** is focused and closes it with nothing saved.
 * **Trust** saves the person's trust in exactly the fingerprint shown and says "Acme can run now".
 *
 * @example
 * <WorkspaceTrustBadge trust={opened.trust} name="Acme" toasts={shell.toasts} />
 */
export function WorkspaceTrustBadge({ trust, name, toasts }: WorkspaceTrustBadgeProps) {
  const badge = useSyncExternalStore(
    (onChange) => trust.subscribe(onChange),
    () => trust.badge,
  );
  const review = useSyncExternalStore(
    (onChange) => trust.subscribe(onChange),
    () => trust.review(),
  );
  const [opened, setOpened] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const opener = useRef<HTMLElement | null>(null);

  if (badge === "none") {
    return null;
  }
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
  return (
    <>
      <Tooltip text={badge === "list-unreadable" ? unreadableTooltip : notTrustedTooltip}>
        {() => (
          <span
            ref={(element) => {
              opener.current = element?.querySelector("button") ?? null;
            }}
            className="inline-flex"
          >
            <HeaderBadge
              as="button"
              action="Review"
              label="Not trusted yet. Review"
              onClick={() => review !== undefined && setOpened(review.fingerprint)}
            >
              Not trusted yet
            </HeaderBadge>
          </span>
        )}
      </Tooltip>
      {opened === undefined || review === undefined ? null : (
        <TrustCheckDialog
          review={review}
          shown={opened}
          busy={busy}
          error={error}
          onNotNow={close}
          onTrust={() => void trustIt(review.fingerprint)}
          returnFocus={() => opener.current}
        />
      )}
    </>
  );
}

interface TrustCheckDialogProps {
  readonly review: TrustReview;
  /** The fingerprint of the check the person opened, to tell when the workspace changed under it. */
  readonly shown: string;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onNotNow: () => void;
  readonly onTrust: () => void;
  readonly returnFocus: () => HTMLElement | null;
}

/** The kit Dialog at `md` with Not now focused, nothing red (mockup-trust 1 and 2). */
function TrustCheckDialog(props: TrustCheckDialogProps) {
  const { review } = props;
  // The tick belongs to the check it was given for: a new fingerprint clears it.
  const [understoodFor, setUnderstoodFor] = useState<string | undefined>();
  const understood = understoodFor === review.fingerprint;
  const understoodId = useId();
  const refusedId = useId();
  const needsConfirm = review.unpinned.length > 0;
  let unavailable: { readonly reason: string } | undefined;
  if (review.refused !== undefined) {
    unavailable = { reason: refusedId };
  } else if (needsConfirm && !understood) {
    unavailable = { reason: understoodId };
  }
  return (
    <Dialog
      title={review.title}
      size="md"
      closeButton={false}
      cancelLabel="Not now"
      confirm={{
        label: "Trust",
        busyLabel: "Trusting…",
        ...(unavailable === undefined ? {} : { unavailable }),
      }}
      busy={props.busy}
      {...(props.error === undefined ? {} : { error: props.error })}
      footnote={review.footnote}
      onConfirm={props.onTrust}
      onCancel={props.onNotNow}
      returnFocus={props.returnFocus}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-small text-fg-muted">{review.source}</p>
        {review.fingerprint === props.shown ? null : (
          <Callout tone="info">
            This workspace changed while you were reviewing it. Check the new version.
          </Callout>
        )}
        {review.unreadable === undefined ? null : (
          <Callout tone="warning">{review.unreadable}</Callout>
        )}
        {review.refused === undefined ? null : (
          <Callout tone="danger">
            <span id={refusedId}>{review.refused}</span>
          </Callout>
        )}
        {review.summary.map((sentence) => (
          <p key={sentence} className="m-0">
            {sentence}
          </p>
        ))}
        {review.sections.map((section) => (
          <TrustSection key={section.heading} section={section} />
        ))}
        {review.unchanged === undefined ? null : (
          <Disclosure summary={review.unchanged}>
            <p className="m-0 px-4 pb-3 text-small text-fg-muted">
              These are the same as when you trusted this workspace.
            </p>
          </Disclosure>
        )}
        {needsConfirm ? (
          <Checkbox
            checked={understood}
            onChange={(checked) => setUnderstoodFor(checked ? review.fingerprint : undefined)}
          >
            <span id={understoodId}>I understand this can download new code when it starts</span>
          </Checkbox>
        ) : null}
      </div>
    </Dialog>
  );
}

function TrustSection({ section }: { readonly section: TrustSectionView }) {
  return (
    <Disclosure summary={section.heading} defaultOpen={section.open}>
      <div className="flex flex-col gap-3 px-4 pb-3">
        {section.intro === undefined ? null : (
          <p className="m-0 text-small text-fg-muted">{section.intro}</p>
        )}
        {section.rows.map((row) => (
          <TrustRow key={`${row.id}:${row.tag ?? ""}:${row.detail}`} row={row} />
        ))}
      </div>
    </Disclosure>
  );
}

function TrustRow({ row }: { readonly row: TrustRowView }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 flex flex-wrap items-baseline gap-2">
        {row.tag === undefined ? null : (
          <span className="text-caption text-fg-muted">{row.tag}</span>
        )}
        <code>{row.id}</code>
        <span className="break-all font-mono text-small">{row.detail}</span>
      </p>
      {row.warning === undefined ? null : (
        <p className="m-0 text-small text-warning">{row.warning}</p>
      )}
      {row.lines.map(([label, value]) => (
        <p key={`${label}:${value}`} className="m-0 text-small">
          <span className="text-fg-muted">{label}</span> {value}
        </p>
      ))}
    </div>
  );
}
