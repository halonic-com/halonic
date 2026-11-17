import { Dialog, Field, Select, TextArea } from "@halonicjs/studio-kit";
import { type Ref, useState } from "react";
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
  /** The "Not started: …" line, or empty; shown in the sheet's alert slot. */
  readonly notStarted: string;
  /** Starts the run; clears the message once it has started. Never rejects. */
  readonly onSend: (workflow: RequestWorkflow, message: string) => Promise<void>;
  /** Close: the sheet goes and the text stays. */
  readonly onClose: () => void;
  readonly messageRef: Ref<HTMLTextAreaElement>;
}

const emptyMessage = "Write a message first.";

/**
 * The request form on a phone (first-run 7.2, component specs 15.3): a form sheet with the
 * workflow's `start.label` as its title, or a **Request type** picker with several, **Message**
 * with the workflow's description as its placeholder, and **Send** full width at the bottom.
 * Focus starts in Message. An empty Send shows "Write a message first." and keeps the sheet.
 * The caller closes the sheet once the run has started.
 */
export function RequestSheet({
  offered,
  draft,
  onDraft,
  busy,
  notStarted,
  onSend,
  onClose,
  messageRef,
}: RequestSheetProps) {
  const [fieldError, setFieldError] = useState("");
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
      title={offered.length === 1 ? picked.label : "New request"}
      closeLabel="Close"
      onCancel={onClose}
      confirm={{ label: "Send", busyLabel: "Working…" }}
      onConfirm={send}
      busy={busy}
      {...(notStarted === "" ? {} : { error: notStarted })}
    >
      {offered.length === 1 ? null : (
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
          onChange={(event) => {
            const value = event.target.value;
            setFieldError("");
            onDraft((d) => ({ ...d, message: value }));
          }}
        />
      </Field>
    </Dialog>
  );
}
