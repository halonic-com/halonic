import { Callout, Checkbox, Dialog, Disclosure } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { TrustReview, TrustRowView, TrustSectionView } from "./workspace-trust-control.ts";

/** The props of {@link TrustCheckDialog}. */
export interface TrustCheckDialogProps {
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
export function TrustCheckDialog(props: TrustCheckDialogProps) {
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
