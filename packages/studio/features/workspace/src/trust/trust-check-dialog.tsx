import {
  Callout,
  Checkbox,
  Dialog,
  Disclosure,
  useModalPolite,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { Marked, markedText } from "./marked-text.tsx";
import type {
  TrustLine,
  TrustLineChange,
  TrustReview,
  TrustRowView,
  TrustSectionView,
  UnfencedYesAsk,
} from "./workspace-trust-control.ts";

const NOT_NOW = "Not now";

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
  /**
   * Counts the times the host saved no yes because the sandbox status changed under it: each one
   * unticks the box, also when the status read again names the same reason (C665-54).
   */
  readonly yesNotSaved?: number | undefined;
  /**
   * Counts the times **Trust** saved nothing because the workspace changed under the open check:
   * from the first one on, the notice that it changed stays, and each one moves focus to
   * **Not now**, so a double press can't trust the new check unread (C711).
   */
  readonly changedRefused?: number | undefined;
}

/**
 * The yes's tick: the check and reason it was given for, and, once the host saved no yes, the
 * review shown then, so the reason is read only once the status was read again.
 */
interface YesTick {
  readonly key: string;
  readonly notSavedAt?: TrustReview | undefined;
}

/**
 * The yes's tick, which belongs to its check and reason: a new reason clears it, and so does the
 * host saving no yes (`notSavedCount` grows), even when the status read again names the same
 * reason. `sayReason` is set while the box was ticked for another reason of this same check, or
 * for this one when the host saved no yes (C665-54, C681).
 */
function useYesTick(review: TrustReview, notSavedCount: number) {
  const key =
    review.unfencedYes === undefined
      ? undefined
      : `${review.fingerprint}:${review.unfencedYes.reason}`;
  const [tick, setTick] = useState<YesTick | undefined>();
  const [notSavedSeen, setNotSavedSeen] = useState(notSavedCount);
  if (notSavedSeen !== notSavedCount) {
    setNotSavedSeen(notSavedCount);
    setTick((was) => (was === undefined ? undefined : { ...was, notSavedAt: review }));
  }
  const notSaved = tick?.notSavedAt !== undefined;
  return {
    ticked: key !== undefined && tick?.key === key && !notSaved,
    sayReason:
      key !== undefined &&
      tick !== undefined &&
      (tick.key !== key || (notSaved && tick.notSavedAt !== review)) &&
      tick.key.startsWith(`${review.fingerprint}:`),
    tick: (checked: boolean) => setTick(checked && key !== undefined ? { key } : undefined),
    said: () => setTick(undefined),
  };
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
  const yes = useYesTick(review, props.yesNotSaved ?? 0);
  const yesTicked = yes.ticked;
  const understoodId = useId();
  const yesId = useId();
  const refusedId = useId();
  const needsConfirm = review.unpinned.length > 0;
  const changed = useChangedNotice(review, props.shown, props.changedRefused ?? 0);
  let unavailable: { readonly reason: string } | undefined;
  if (review.refused !== undefined) {
    unavailable = { reason: refusedId };
  } else if (needsConfirm && !understood) {
    unavailable = { reason: understoodId };
  } else if (review.unfencedYes !== undefined && !yesTicked) {
    unavailable = { reason: yesId };
  }
  return (
    <Dialog
      title={markedText(review.title)}
      size="md"
      closeButton={false}
      cancelLabel={NOT_NOW}
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
      <div ref={changed.body} className="flex flex-col gap-4 wrap-anywhere">
        <p className="m-0 text-small text-fg-muted">
          <Marked text={review.source} />
        </p>
        {changed.say ? (
          <Callout tone="info">
            This workspace changed while you were reviewing it. Check the new version.
          </Callout>
        ) : null}
        {review.unreadable === undefined ? null : (
          <Callout tone="warning">{review.unreadable}</Callout>
        )}
        {review.refused === undefined ? null : (
          <Callout tone="danger">
            <span id={refusedId}>
              <Marked text={review.refused} />
            </span>
          </Callout>
        )}
        {review.summary.map((sentence) => (
          <p key={sentence} className="m-0">
            <Marked text={sentence} />
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
          <UnfencedYesBox
            ask={review.unfencedYes}
            id={yesId}
            ticked={yesTicked}
            onTick={yes.tick}
            sayReason={yes.sayReason}
            onSaid={yes.said}
          />
        )}
      </div>
    </Dialog>
  );
}

/**
 * Whether to say the workspace changed under the open check: while the check shown isn't the one
 * opened, and from the first **Trust** refused for it on, which also moves focus to **Not now**
 * each time (C711). `body` goes on the dialog's body, to find **Not now** from.
 */
function useChangedNotice(review: TrustReview, shown: string, refused: number) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (refused === 0) return;
    notNowOf(body.current)?.focus();
  }, [refused]);
  return { body, say: review.fingerprint !== shown || refused > 0 };
}

/**
 * The dialog's **Not now**. The kit's Dialog focuses it only when it opens, so it's found by its
 * label among the footer's buttons, which on a phone come in another order.
 */
function notNowOf(body: HTMLElement | null): HTMLButtonElement | undefined {
  const buttons = body?.closest("dialog")?.querySelectorAll<HTMLButtonElement>("footer button");
  return [...(buttons ?? [])].find((button) => button.textContent === NOT_NOW);
}

/**
 * The yes's checkbox, inside the dialog so it reaches the dialog's polite region. When the reason
 * changed under a ticked box, or the host saved no yes for the same reason, focus goes to the
 * unticked box and the region reads the reason once, since **Trust** can't be pressed now (as the
 * plugin check does, C665-54, C681).
 */
function UnfencedYesBox(props: {
  readonly ask: UnfencedYesAsk;
  readonly id: string;
  readonly ticked: boolean;
  readonly onTick: (checked: boolean) => void;
  readonly sayReason: boolean;
  readonly onSaid: () => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  const polite = useModalPolite();
  const { sayReason, onSaid, ask } = props;
  useEffect(() => {
    if (!sayReason) return;
    box.current?.focus();
    polite?.say(ask.reasonLine);
    onSaid();
  }, [sayReason, onSaid, ask.reasonLine, polite]);
  return (
    <Checkbox ref={box} checked={props.ticked} onChange={props.onTick}>
      <span id={props.id}>{ask.checkbox}</span>
    </Checkbox>
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
        <code>
          <Marked text={row.id} />
        </code>
        {/* An empty detail would keep its gap and push the flag 16 px from the name (C667). */}
        {row.detail === "" ? null : (
          <span className="break-all font-mono text-small">
            {row.detailWas === undefined ? (
              <Marked text={row.detail} />
            ) : (
              <WasNow was={row.detailWas} now={row.detail} />
            )}
          </span>
        )}
        {row.flag === undefined ? null : (
          // The dot, then the amber words starting with the triangle, as R12's Runs line does.
          // Where the flag wouldn't fit beside the name, it takes its own line without the dot:
          // a separator never starts a line (C678).
          <span className="text-small @max-[24rem]:basis-full">
            <span className="@max-[24rem]:hidden">{"· "}</span>
            <span className="inline-flex items-baseline gap-1 text-attention">
              <Triangle />
              <span>
                <Marked text={row.flag} />
              </span>
            </span>
          </span>
        )}
      </p>
      {row.warning === undefined ? null : (
        <p className="m-0 text-small text-attention">
          <Marked text={row.warning} />
        </p>
      )}
      {row.lines.length === 0 ? null : (
        // Label and value columns: a line without a label continues the one above, its value
        // under the first value, with no stray colon (C592). Where the row is narrower than the
        // flag's 24rem, each label goes over its value instead, so a value never gets squeezed
        // beside "Takes from your environment" (C706).
        <div className="grid grid-cols-[auto_1fr] gap-x-1 gap-y-1 @max-[24rem]:grid-cols-1">
          {row.lines.map((line) => (
            <TrustLineView key={`${line[0]}:${line[1]}`} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrustLineView({ line }: { readonly line: TrustLine }) {
  const [label, value, tone, change] = line;
  // Below 24rem the grid has one column: the value goes under its label (C706).
  const column = "col-start-2 @max-[24rem]:col-start-1";
  return (
    <p className="col-span-2 m-0 grid grid-cols-subgrid text-small @max-[24rem]:col-span-1">
      {label === "" ? null : (
        <>
          <span className="text-fg-muted">
            <Marked text={label} />:
          </span>{" "}
        </>
      )}
      {tone === "warning" ? (
        <span className={`${column} inline-flex gap-1 text-attention`}>
          <Triangle />
          <span>
            <Marked text={value} />
          </span>
        </span>
      ) : (
        <span className={`${column}${toneClass(tone)}`}>
          <ChangedValue value={value} change={change} />
        </span>
      )}
    </p>
  );
}

/**
 * A line's value, with what changed in it: old → new, or a value that wasn't there in `fg` at
 * weight 500, like a new value.
 */
function ChangedValue(props: {
  readonly value: string;
  readonly change: TrustLineChange | undefined;
}) {
  const { value, change } = props;
  if (change === undefined) return <Marked text={value} />;
  if (change === "added") {
    return (
      <span className="font-medium text-fg">
        <span className="sr-only">new: </span>
        <Marked text={value} />
      </span>
    );
  }
  return <WasNow was={change.was} now={value} />;
}

/**
 * Old → new (mockup-trust section 2): the old value in `fg-muted`, the arrow in `fg-subtle`, the
 * new one in weight 500, with no strikethrough so the two are easy to compare. The new one is in
 * `fg`, as the drawing's values are: the section's own values are `fg-muted`, so weight alone
 * would barely set it apart. A screen reader hears "was …, now …" instead of the arrow (flow 3.3).
 */
function WasNow(props: { readonly was: string; readonly now: string }) {
  return (
    <>
      <span className="text-fg-muted">
        <span className="sr-only">was </span>
        <Marked text={props.was} />
      </span>
      <span className="sr-only">, now </span>
      <span aria-hidden="true" className="text-fg-subtle">
        {" → "}
      </span>
      <span className="font-medium text-fg">
        <Marked text={props.now} />
      </span>
    </>
  );
}

/** A value's tone: `attention` in amber, `code` (a path, a site, an env entry) in mono. */
function toneClass(tone: TrustLine[2]): string {
  if (tone === "attention") return " text-attention";
  if (tone === "code") return " font-mono";
  return "";
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
