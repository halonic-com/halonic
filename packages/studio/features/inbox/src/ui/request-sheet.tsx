import { Button, Dialog, Field, Select, TextArea } from "@halonicjs/studio-kit";
import { type Ref, useId, useState } from "react";
import type { RequestWorkflow } from "../request/inbox-requests.ts";
import type { RequestDraft } from "./request-form.tsx";

/** Props for {@link RequestSheet}. */
export interface RequestSheetProps {
  /** What the workspace offers; never empty. */
  readonly offered: readonly RequestWorkflow[];
  readonly draft: RequestDraft;
  readonly onDraft: (update: (draft: RequestDraft) => RequestDraft) => void;
  /** A request is starting: Send is busy and Close waits. */
  readonly busy: boolean;
  /**
   * The run has started and its card hasn't arrived yet: Send still reads "Working…", and Close
   * works, because closing doesn't stop the run (first-run 7.2).
   */
  readonly waiting: boolean;
  /** The "Not started: …" line, or empty; shown in the sheet's alert slot. */
  readonly notStarted: string;
  /**
   * The run started but failed before its card arrived: the run page's failure line, shown in the
   * alert slot with **Open run** (with `openRun`). The message stays, to send again.
   */
  readonly runFailed?: { readonly line: string; readonly openRun?: () => void } | undefined;
  /** With a refusal for the month's budget: **Change budget**, under the fields. */
  readonly onChangeBudget?: (() => void) | undefined;
  /** Starts the run; clears the message once it has started. Never rejects. */
  readonly onSend: (workflow: RequestWorkflow, message: string) => Promise<void>;
  /** Close: the sheet goes; the text stays, unless it was sent and the sheet waits. */
  readonly onClose: () => void;
  readonly messageRef: Ref<HTMLTextAreaElement>;
}

const emptyMessage = "Write a message first.";

/**
 * The request form on a phone (first-run 7.2, component specs 15.3): a form sheet titled
 * "New request" with the workflow's `start.label` as a read-only line, or a **Request type**
 * picker with several, **Message** with the workflow's description as its placeholder, and
 * **Send** full width at the bottom. Focus starts in Message. An empty Send shows "Write a message
 * first." and keeps the sheet. Close is named "Close, keeps your message" (accessibility pass
 * 3.5), and plain "Close" while the sheet waits, since closing then clears the sent text. Send
 * reads "Working…" until the run's card arrives or the run ends (HAL-13723).
 */
export function RequestSheet({
  offered,
  draft,
  onDraft,
  busy,
  waiting,
  notStarted,
  runFailed,
  onChangeBudget,
  onSend,
  onClose,
  messageRef,
}: RequestSheetProps) {
  const [fieldError, setFieldError] = useState("");
  const workflowLine = useId();
  const picked = offered.find((workflow) => workflow.key === draft.workflow) ?? offered[0];
  if (picked === undefined) return null;

  const send = () => {
    const message = draft.message.trim();
    if (message === "") {
      setFieldError(emptyMessage);
      if (typeof messageRef === "object" && messageRef !== null) messageRef.current?.focus();
      return;
    }
    setFieldError("");
    void onSend(picked, message);
  };

  return (
    <Dialog
      form
      title="New request"
      closeLabel={waiting ? "Close" : "Close, keeps your message"}
      onCancel={onClose}
      confirm={{ label: "Send", busyLabel: "Working…" }}
      onConfirm={send}
      busy={busy || waiting}
      closeWhileBusy={waiting}
      {...(offered.length === 1 ? { describedBy: workflowLine } : {})}
      {...alertOf(notStarted, runFailed)}
    >
      {offered.length === 1 ? (
        <p id={workflowLine} className="text-section">
          {picked.label}
        </p>
      ) : (
        <Field label="Request type">
          <Select
            options={offered.map(({ key, label }) => ({ value: key, label }))}
            value={picked.key}
            onChange={(workflow) => onDraft((d) => ({ ...d, workflow }))}
          />
        </Field>
      )}
      <Field label="Message" error={fieldError}>
        <TextArea
          ref={messageRef}
          value={draft.message}
          readOnly={waiting}
          placeholder={picked.description ?? "What do you need?"}
          onChange={(event) => {
            const value = event.target.value;
            setFieldError("");
            onDraft((d) => ({ ...d, message: value }));
          }}
        />
      </Field>
      {notStarted !== "" && onChangeBudget !== undefined ? (
        <div>
          <Button variant="ghost" size="sm" onClick={onChangeBudget}>
            Change budget
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

/** The alert slot's line: the request didn't start, or its run failed, with **Open run**. */
function alertOf(
  notStarted: string,
  runFailed: RequestSheetProps["runFailed"],
): { error?: string; errorAction?: { label: string; onClick: () => void } } {
  if (notStarted !== "") return { error: notStarted };
  if (runFailed === undefined) return {};
  const { line, openRun } = runFailed;
  return {
    error: line,
    ...(openRun === undefined ? {} : { errorAction: { label: "Open run", onClick: openRun } }),
  };
}
