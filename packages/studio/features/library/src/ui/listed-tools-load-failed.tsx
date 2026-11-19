import type { CalloutAction } from "@halonicjs/studio-kit";
import { copyDetailsWords, detailsOf, useCopyDetails } from "@halonicjs/studio-shell";
import type { LoadFailureLine } from "../listed-tools-load-failure.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { refusalLineText } from "../refusal-line.ts";

/** The line's text, with a program's name in code type. */
export function LoadFailedText({ line }: { readonly line: LoadFailureLine }) {
  return (
    <>
      {line.parts.map((part, index) =>
        part.code === true ? (
          <code key={`${index}:${part.text}`} className="font-mono text-code">
            {part.text}
          </code>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** What the "Couldn't list the tools" line's buttons do. */
export interface LoadFailedHandlers {
  /** What the tools couldn't be listed with: only **Copy details** puts it on the clipboard. */
  readonly error: unknown;
  readonly onTryAgain: () => void;
  /** Opens the workspace's trust check; without it, a workspace that isn't trusted gets no button. */
  readonly onReviewTrust?: (() => void) | undefined;
}

/**
 * The actions of the "Couldn't list the tools" line: **Review**, the trust check, when the
 * workspace isn't trusted, else **Try again**; then **Copy details** when the line can't say all
 * that went wrong.
 */
export function useLoadFailedActions(
  line: LoadFailureLine,
  { error, onTryAgain, onReviewTrust }: LoadFailedHandlers,
): readonly CalloutAction[] {
  const copyDetails = useCopyDetails();
  const actions: CalloutAction[] = [];
  if (line.button === "try-again") {
    actions.push({ label: listedToolsWords.tryAgain, onClick: onTryAgain });
  } else if (onReviewTrust !== undefined) {
    actions.push({ label: listedToolsWords.reviewTrust, onClick: onReviewTrust });
  }
  if (line.copyDetails) {
    const details = detailsOf(refusalLineText(line.parts), error);
    actions.push({ label: copyDetailsWords.label, onClick: () => copyDetails(details) });
  }
  return actions;
}
