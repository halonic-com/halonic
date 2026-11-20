// The parts of the plugin trust check that follow this computer's sandbox status: the checkbox
// and its saved yes, the Checking line and the last line (the "Runs" line design, HAL-1873).

import { type RunnerUnfencedReason, runnerUnfencedWords } from "@halonicjs/app";
import {
  Checkbox,
  ExternalLink,
  Spinner,
  useModalPolite,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import {
  CHECKING_SANDBOX,
  needsUnfencedYes,
  type PluginCode,
  SANDBOX_DOCS,
  type TrustFence,
  type TrustLastLine,
  UNFENCED_CHECKBOX,
  type UnfencedYes,
  unfencedAllowedLine,
} from "./runs-line.ts";

/** The person's yes to run plugin code without the sandbox, as the dialog holds it. */
export interface UnfencedYesState {
  /** The reason the checkbox asks about, while it shows. */
  readonly asking: RunnerUnfencedReason | undefined;
  readonly ticked: boolean;
  readonly tick: (checked: boolean) => void;
  /**
   * The box was ticked for another reason, and the host's status now names this one (the host's
   * `reason_changed`): the box is unticked, and the change not yet said.
   */
  readonly changed: boolean;
  /** Once the change is said: it isn't said again. */
  readonly said: () => void;
  /** The day of the saved yes for this reason, for R6 in place of the checkbox. */
  readonly allowedOn: string | undefined;
  /** Why **Trust** can't be pressed yet: the id of the line that says so. */
  readonly unavailable: { readonly reason: string } | undefined;
  /** The reason to save with **Trust**, once ticked. */
  readonly allow: RunnerUnfencedReason | undefined;
  readonly checkingId: string;
  readonly checkboxId: string;
}

/**
 * The checkbox's state (design sections 2 and 7): asked for plugin code outside the sandbox
 * without a saved yes for this reason. **Trust** stays unavailable, though focusable, while the
 * status is read and until the box is ticked. A tick belongs to its reason: a new one clears it.
 */
export function useUnfencedYes(
  fence: TrustFence,
  code: PluginCode,
  saved: UnfencedYes | undefined,
): UnfencedYesState {
  const [tickedFor, setTickedFor] = useState<RunnerUnfencedReason | undefined>();
  const checkingId = useId();
  const checkboxId = useId();
  const reason = fence?.state === "not-fenced" ? fence.reason : undefined;
  const asking = needsUnfencedYes(fence, code, saved) ? reason : undefined;
  const ticked = asking !== undefined && tickedFor === asking;
  let unavailable: { readonly reason: string } | undefined;
  if (fence?.state === "checking") unavailable = { reason: checkingId };
  else if (asking !== undefined && !ticked) unavailable = { reason: checkboxId };
  return {
    asking,
    ticked,
    tick: (checked) => setTickedFor(checked ? asking : undefined),
    changed: asking !== undefined && tickedFor !== undefined && tickedFor !== asking,
    said: () => setTickedFor(undefined),
    allowedOn: reason !== undefined && code.backend && asking === undefined ? saved?.on : undefined,
    unavailable,
    allow: ticked ? asking : undefined,
    checkingId,
    checkboxId,
  };
}

/**
 * The checkbox (R5) above the buttons, or the saved yes (R6) in its place. When the reason
 * changed under a ticked box, focus goes to the unticked box and the dialog's polite region reads
 * the new reason once (R3's words; UY1, HAL-14003), since **Trust** can't be pressed now.
 */
export function UnfencedConsent({ yes }: { readonly yes: UnfencedYesState }) {
  const box = useRef<HTMLInputElement>(null);
  const polite = useModalPolite();
  const { asking, changed, said } = yes;
  useEffect(() => {
    if (!changed || asking === undefined) return;
    box.current?.focus();
    polite?.say(runnerUnfencedWords(asking, "plugin").reason);
    said();
  }, [asking, changed, said, polite]);
  if (yes.asking !== undefined) {
    return (
      <Checkbox ref={box} checked={yes.ticked} onChange={yes.tick}>
        <span id={yes.checkboxId}>{UNFENCED_CHECKBOX}</span>
      </Checkbox>
    );
  }
  if (yes.allowedOn === undefined) return null;
  return <p className="text-small text-fg-muted">{unfencedAllowedLine(yes.allowedOn)}</p>;
}

/** Under the summary while the host reads this computer's sandbox status (R4). */
export function Checking({ id }: { readonly id: string }) {
  return (
    <p className="flex items-center gap-2 text-small text-fg-muted">
      <span aria-hidden="true" className="size-4 shrink-0">
        <Spinner />
      </span>
      <span id={id}>{CHECKING_SANDBOX}</span>
    </p>
  );
}

/**
 * The last line, outside the scroll area. Not in the sandbox, the warning is amber with the
 * triangle, so the words and the mark carry it, never the colour alone; the reason, the fix and
 * the docs link follow in muted text, then the sentence that's always true (design section 3).
 */
export function LastLine({ line }: { readonly line: TrustLastLine }) {
  if (line.kind === "plain") return line.text;
  return (
    <>
      <span className="flex gap-2 text-attention">
        <span aria-hidden="true" className="mt-0.5 inline-grid size-icon-sm shrink-0 *:size-full">
          <WarningIcon />
        </span>
        <span>{line.warning}</span>
      </span>
      <span className="mt-1 block">
        {line.words.reason} {line.words.fix}{" "}
        <ExternalLink href={`${SANDBOX_DOCS}/${line.words.docsKey}`}>
          {line.words.docsLabel}
        </ExternalLink>
      </span>
      <span className="mt-1 block">{line.end}</span>
    </>
  );
}
