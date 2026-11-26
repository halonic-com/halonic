import { CodeDisplay, Dialog, Spinner } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { Countdown } from "../connect/connect-steps.tsx";
import * as words from "../server-engine-words.ts";
import type { PairView } from "./pair-flow.ts";

/**
 * P2: the check code to compare with the server's, whether the server answers, the time left and
 * the note, with Cancel as the one button. ✕ and Escape cancel too.
 */
export function WaitStep({
  title,
  view,
  name,
  leftMs,
  onCancel,
}: {
  readonly title: string;
  readonly view: Extract<PairView, { readonly stage: "waiting" }>;
  readonly name: string;
  readonly leftMs: number;
  readonly onCancel: () => void;
}) {
  const [before, shownName, after] = words.waitNote(name);
  // Focus starts on the check code, so a screen reader reads it first: comparing it is the step.
  // The kit's Dialog takes `initialFocus` only for a form, so this runs after its own focus.
  const codeBox = useRef<HTMLDivElement>(null);
  useEffect(() => codeBox.current?.focus(), []);
  return (
    <Dialog
      size="md"
      title={title}
      closeLabel={`Close ${title}`}
      confirm={{ label: words.CANCEL, busyLabel: words.CANCEL, variant: "secondary" }}
      cancelButton={false}
      onConfirm={onCancel}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-fg">{words.CHECK_LEAD}</p>
        <div ref={codeBox} tabIndex={-1} className="rounded-md focus-ring">
          <CodeDisplay code={view.checkCode} group={3} label={words.CHECK_CODE_LABEL} />
        </div>
        <p className="m-0 flex items-center gap-2 text-fg-muted" aria-live="polite">
          <span className="inline-grid size-4">
            <Spinner />
          </span>
          {view.reachable ? words.WAITING_FOR_ALLOW : words.STILL_TRYING}
        </p>
        <Countdown leftMs={leftMs} />
        <p className="m-0 text-small text-fg-muted">
          {before}
          <span className="font-semibold text-fg">{shownName}</span>
          {after}
        </p>
      </div>
    </Dialog>
  );
}
