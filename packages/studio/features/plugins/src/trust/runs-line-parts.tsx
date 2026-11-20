// The parts of the plugin trust check that follow this computer's sandbox status: the checkbox
// and its saved yes, the Checking line and the last line (the "Runs" line design, HAL-1873).

import type { RunnerUnfencedReason } from "@halonicjs/app";
import { Checkbox, ExternalLink, Spinner, WarningIcon } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
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
    allowedOn: reason !== undefined && code.backend && asking === undefined ? saved?.on : undefined,
    unavailable,
    allow: ticked ? asking : undefined,
    checkingId,
    checkboxId,
  };
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
 * the docs link follow in muted text, then the saved yes (R6), the sentence that's always true and
 * the checkbox (R5) right above the buttons (design section 3, frames rl-plugin-windows and
 * rl-plugin-windows-allowed). The checkbox comes after the words it confirms, on screen, in the
 * DOM and for Tab, and scrolls with them on a short window (WCAG 1.3.2).
 */
export function LastLine({
  line,
  yes,
}: {
  readonly line: TrustLastLine;
  readonly yes: UnfencedYesState;
}) {
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
      {yes.allowedOn === undefined ? null : (
        <span className="mt-1 block">{unfencedAllowedLine(yes.allowedOn)}</span>
      )}
      <span className="mt-1 block">{line.end}</span>
      {yes.asking === undefined ? null : (
        <span className="mt-3 block">
          <Checkbox checked={yes.ticked} onChange={yes.tick}>
            <span id={yes.checkboxId}>{UNFENCED_CHECKBOX}</span>
          </Checkbox>
        </span>
      )}
    </>
  );
}
