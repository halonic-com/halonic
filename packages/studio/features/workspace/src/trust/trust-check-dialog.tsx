import { Callout, Checkbox, Dialog, Disclosure, WarningIcon } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type {
  TrustLine,
  TrustReview,
  TrustRowView,
  TrustSectionView,
} from "./workspace-trust-control.ts";

/** The props of {@link TrustCheckDialog}. */
export interface TrustCheckDialogProps {
  readonly review: TrustReview;
  /** The fingerprint of the check the person opened, to tell when the workspace changed under it. */
  readonly shown: string;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onNotNow: () => void;
  /** `allowUnfenced` is whether the person ticked the box for the review's `unfencedYes`. */
  readonly onTrust: (allowUnfenced: boolean) => void;
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * The kit Dialog at `md` with Not now focused, nothing red (mockup-trust 1 and 2). Each checkbox
 * sits above the buttons, and **Trust** stays unavailable, though focusable, until every one is
 * ticked (the "Runs" line design section 4).
 */
export function TrustCheckDialog(props: TrustCheckDialogProps) {
  const { review } = props;
  // The tick belongs to the check it was given for: a new fingerprint clears it.
  const [understoodFor, setUnderstoodFor] = useState<string | undefined>();
  const understood = understoodFor === review.fingerprint;
  // The yes's tick belongs to its reason too: a new one clears it.
  const yesKey =
    review.unfencedYes === undefined
      ? undefined
      : `${review.fingerprint}:${review.unfencedYes.reason}`;
  const [yesFor, setYesFor] = useState<string | undefined>();
  const yesTicked = yesKey !== undefined && yesFor === yesKey;
  const understoodId = useId();
  const yesId = useId();
  const refusedId = useId();
  const needsConfirm = review.unpinned.length > 0;
  let unavailable: { readonly reason: string } | undefined;
  if (review.refused !== undefined) {
    unavailable = { reason: refusedId };
  } else if (needsConfirm && !understood) {
    unavailable = { reason: understoodId };
  } else if (yesKey !== undefined && !yesTicked) {
    unavailable = { reason: yesId };
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
      onConfirm={() => props.onTrust(yesTicked)}
      onCancel={props.onNotNow}
      returnFocus={props.returnFocus}
    >
      {/* A folder's path, a program's name or a secret's name can be one long run with nowhere to
          break. It breaks anywhere instead, so a phone-narrow window never scrolls the dialog
          sideways (WCAG 1.4.10, HAL-13186). Words that fit don't change. */}
      <div className="flex flex-col gap-4 wrap-anywhere">
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
        {review.unfencedYes === undefined ? null : (
          <Checkbox
            checked={yesTicked}
            onChange={(checked) => setYesFor(checked ? yesKey : undefined)}
          >
            <span id={yesId}>{review.unfencedYes.checkbox}</span>
          </Checkbox>
        )}
      </div>
    </Dialog>
  );
}

function TrustSection({ section }: { readonly section: TrustSectionView }) {
  return (
    <Disclosure
      summary={section.heading}
      defaultOpen={section.open}
      {...(section.mark === undefined ? {} : { mark: section.mark })}
    >
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
    // A container, so a phone-narrow row can stack the flag under the name (C678).
    <div className="@container flex flex-col gap-1">
      <p className="m-0 flex flex-wrap items-baseline gap-2">
        {row.tag === undefined ? null : (
          <span className="text-caption text-fg-muted">{row.tag}</span>
        )}
        <code>{row.id}</code>
        {/* An empty detail would keep its gap and push the flag 16 px from the name (C667). */}
        {row.detail === "" ? null : (
          <span className="break-all font-mono text-small">{row.detail}</span>
        )}
        {row.flag === undefined ? null : (
          // The dot, then the amber words starting with the triangle, as R12's Runs line does.
          // Where the flag wouldn't fit beside the name, it takes its own line without the dot:
          // a separator never starts a line (C678).
          <span className="text-small @max-[24rem]:basis-full">
            <span className="@max-[24rem]:hidden">{"· "}</span>
            <span className="inline-flex items-baseline gap-1 text-attention">
              <Triangle />
              <span>{row.flag}</span>
            </span>
          </span>
        )}
      </p>
      {row.warning === undefined ? null : (
        <p className="m-0 text-small text-attention">{row.warning}</p>
      )}
      {row.lines.length === 0 ? null : (
        // Label and value columns: a line without a label continues the one above, its value
        // under the first value, with no stray colon (C592).
        <div className="grid grid-cols-[auto_1fr] gap-x-1 gap-y-1">
          {row.lines.map((line) => (
            <TrustLineView key={`${line[0]}:${line[1]}`} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrustLineView({ line }: { readonly line: TrustLine }) {
  const [label, value, tone] = line;
  return (
    <p className="col-span-2 m-0 grid grid-cols-subgrid text-small">
      {label === "" ? null : (
        <>
          <span className="text-fg-muted">{label}:</span>{" "}
        </>
      )}
      {tone === "warning" ? (
        <span className="col-start-2 inline-flex gap-1 text-attention">
          <Triangle />
          <span>{value}</span>
        </span>
      ) : (
        <span className={tone === "attention" ? "col-start-2 text-attention" : "col-start-2"}>
          {value}
        </span>
      )}
    </p>
  );
}

/**
 * The triangle before a warning's words, hidden from screen readers: the words carry the warning,
 * never the colour or the mark alone.
 */
function Triangle() {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-icon-sm shrink-0 align-text-bottom *:size-full"
    >
      <WarningIcon />
    </span>
  );
}
