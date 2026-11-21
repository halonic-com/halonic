import { Button, CommandBox, Field, Select, TextArea } from "@halonicjs/studio-kit";
import { copyDetailsWords } from "@halonicjs/studio-shell";
import { type FormEvent, type ReactNode, type Ref, useState } from "react";
import type { RequestWorkflow } from "../request/inbox-requests.ts";

/** What you have typed in the form. It lives above the form, so it stays while a card is open. */
export interface RequestDraft {
  /** The picked workflow's key; empty until you pick, which means the first one. */
  readonly workflow: string;
  readonly message: string;
}

/** The form with nothing typed. */
export const emptyDraft: RequestDraft = { workflow: "", message: "" };

/** Props for {@link RequestForm}. */
export interface RequestFormProps {
  /** What the workspace offers; never empty. */
  readonly offered: readonly RequestWorkflow[];
  readonly draft: RequestDraft;
  readonly onDraft: (update: (draft: RequestDraft) => RequestDraft) => void;
  /** A request is starting. It lives above the form too, so a second Send can't follow a card. */
  readonly busy: boolean;
  /** The "Not started: …" line, or empty. */
  readonly notStarted: string;
  /** The command the line's next step leads to, in a CommandBox under the line (C533-2). */
  readonly notStartedCommand?: string | undefined;
  /** With a refusal for the month's budget: **Change budget**, after the line. */
  readonly onChangeBudget?: (() => void) | undefined;
  /** With a failure Halonic can't explain: **Copy details**, after the line (22 F13). */
  readonly onCopyDetails?: (() => void) | undefined;
  /** Starts the run; clears the message once it has started. Never rejects. */
  readonly onSend: (workflow: RequestWorkflow, message: string) => Promise<void>;
  /** Esc: goes back to the list. The text stays. */
  readonly onEscape: () => void;
  readonly messageRef: Ref<HTMLTextAreaElement>;
}

const emptyMessage = "Write a message first.";

/**
 * The request form (flow-inbox 3.4, first-run 4.1, microcopy 10.3): the workflow's `start.label`
 * as plain text, or a **Request type** picker with several; **Message**, whose placeholder is the
 * workflow's description; **Send**. Enter adds a line and Ctrl Enter sends. **Send** is never
 * disabled: an empty message says "Write a message first." and focuses Message. While sending,
 * the button says "Working…" and keeps focus; a refusal shows in an always-present line under the
 * form. The text is cleared only once the run has started.
 */
export function RequestForm({
  offered,
  draft,
  onDraft,
  busy,
  notStarted,
  notStartedCommand,
  onChangeBudget,
  onCopyDetails,
  onSend,
  onEscape,
  messageRef,
}: RequestFormProps) {
  const [fieldError, setFieldError] = useState("");
  const picked = offered.find((workflow) => workflow.key === draft.workflow) ?? offered[0];
  if (picked === undefined) return null;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const message = draft.message.trim();
    if (message === "") {
      setFieldError(emptyMessage);
      focusMessage(messageRef);
      return;
    }
    setFieldError("");
    await onSend(picked, message);
  };

  return (
    <form data-request-form onSubmit={send} className="flex w-full flex-col gap-4 p-6" noValidate>
      {offered.length === 1 ? (
        <h2 className="text-section">{picked.label}</h2>
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
          placeholder={picked.description ?? "What do you need?"}
          submitOnCtrlEnter
          onChange={(event) => {
            const value = event.target.value;
            setFieldError("");
            onDraft((d) => ({ ...d, message: value }));
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onEscape();
          }}
        />
      </Field>
      <div>
        <Button type="submit" busy={busy} busyLabel="Working…">
          Send
        </Button>
      </div>
      {/* Only the sentence is the alert, so its buttons aren't read with it (C533-3). */}
      <div className="flex flex-col gap-2 text-small text-fg-muted">
        <p>
          <span role="alert">{notStarted}</span>
          {notStarted !== "" && onChangeBudget !== undefined ? (
            <AfterLine onClick={onChangeBudget}>Change budget</AfterLine>
          ) : null}
          {notStarted !== "" && onCopyDetails !== undefined ? (
            <AfterLine onClick={onCopyDetails}>{copyDetailsWords.label}</AfterLine>
          ) : null}
        </p>
        {notStarted !== "" && notStartedCommand !== undefined ? (
          <CommandBox command={notStartedCommand} />
        ) : null}
      </div>
    </form>
  );
}

/**
 * A button after the line, behind a "·". The dot and the button wrap as one piece, so a narrow
 * window never leaves the dot alone at the end of a line (C533-3).
 */
function AfterLine({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <>
      {" "}
      <span className="whitespace-nowrap">
        {"· "}
        <Button variant="ghost" size="sm" onClick={onClick}>
          {children}
        </Button>
      </span>
    </>
  );
}

function focusMessage(ref: Ref<HTMLTextAreaElement>): void {
  if (typeof ref === "object" && ref !== null) ref.current?.focus();
}
