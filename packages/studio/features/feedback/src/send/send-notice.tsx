import { Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { feedbackWords } from "../feedback-words.ts";

/**
 * How Studio reaches Paperclip as the window opens: `online`, or Send saves the feedback on this
 * computer until Studio is back online (`offline`) or connected to Paperclip (`not-connected`).
 */
export type FeedbackConnection = "online" | "offline" | "not-connected";

/** Which screenshot a Send carries: the crop, or none ("Send without a screenshot"). */
export type Screenshot = "crop" | "none";

/**
 * Why the last Send didn't go: Paperclip refused it (Try again sends `retry` again), or the crop
 * couldn't become a PNG.
 */
export type SendProblem =
  | { readonly kind: "refused"; readonly reason: string; readonly retry: Screenshot }
  | { readonly kind: "no-png" };

/**
 * The Callout above the footnote: what went wrong with the last Send, which takes the focus once
 * so a screen reader hears it, or else that Send will only save the feedback for now.
 */
export function SendNotice({
  problem,
  connection,
  onSend,
}: {
  readonly problem: SendProblem | undefined;
  readonly connection: FeedbackConnection;
  /** Sends the feedback as it is now, with the crop or without a screenshot. */
  readonly onSend: (screenshot: Screenshot) => void;
}) {
  if (problem !== undefined) return <ProblemCallout problem={problem} onSend={onSend} />;
  if (connection === "offline") {
    return (
      <Callout tone="info" title={feedbackWords.offlineTitle}>
        {feedbackWords.offlineText}
      </Callout>
    );
  }
  if (connection === "not-connected") {
    return (
      <Callout tone="info" title={feedbackWords.notConnectedTitle}>
        {feedbackWords.notConnectedText}
      </Callout>
    );
  }
  return null;
}

function ProblemCallout({
  problem,
  onSend,
}: {
  readonly problem: SendProblem;
  readonly onSend: (screenshot: Screenshot) => void;
}) {
  const callout = useRef<CalloutHandle>(null);
  // Each new problem is a new object, so a second refusal takes the focus again.
  useEffect(() => {
    callout.current?.focus();
  }, [problem]);
  if (problem.kind === "no-png") {
    return (
      <Callout
        ref={callout}
        announce="focus"
        tone="danger"
        title={feedbackWords.noPngTitle}
        action={{
          label: feedbackWords.sendWithoutScreenshot,
          onClick: () => onSend("none"),
        }}
      >
        {feedbackWords.noPngText}
      </Callout>
    );
  }
  const reason = withoutFullStop(problem.reason);
  return (
    <Callout
      ref={callout}
      announce="focus"
      tone="danger"
      title={feedbackWords.refusedTitle}
      action={{ label: feedbackWords.tryAgain, onClick: () => onSend(problem.retry) }}
    >
      {/* With no reason, the title stands alone (Sofia's check on HAL-19391). */}
      {reason === "" ? null : feedbackWords.refusedText(reason)}
    </Callout>
  );
}

/** The reason without its closing full stops, so "Paperclip said: {reason}." never shows "..". */
export function withoutFullStop(reason: string): string {
  return reason.trim().replace(/\.+$/, "").trimEnd();
}
