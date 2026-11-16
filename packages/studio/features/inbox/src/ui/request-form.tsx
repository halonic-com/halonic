import { Button, Field, Select, TextArea, useToastStore } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type FormEvent, type Ref, useState } from "react";
import type { InboxRequests, RequestWorkflow } from "../request/inbox-requests.ts";
import { notStartedLine } from "../request/not-started.ts";

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
  readonly requests: InboxRequests;
  /** What the workspace offers; never empty. */
  readonly offered: readonly RequestWorkflow[];
  readonly draft: RequestDraft;
  readonly onDraft: (draft: RequestDraft) => void;
  readonly words: EngineWords;
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
  requests,
  offered,
  draft,
  onDraft,
  words,
  onEscape,
  messageRef,
}: RequestFormProps) {
  const toasts = useToastStore();
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [notStarted, setNotStarted] = useState("");
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
    setNotStarted("");
    setBusy(true);
    try {
      await requests.start(picked.key, message);
      onDraft({ ...draft, message: "" });
      toasts?.show({ tone: "success", title: `${picked.label} started` });
    } catch (error) {
      setNotStarted(notStartedLine(error, words));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="flex w-full flex-col gap-4 p-6" noValidate>
      {offered.length === 1 ? (
        <h2 className="text-section">{picked.label}</h2>
      ) : (
        <Field label="Request type">
          <Select
            options={offered.map(({ key, label }) => ({ value: key, label }))}
            value={picked.key}
            onChange={(workflow) => onDraft({ ...draft, workflow })}
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
            setFieldError("");
            onDraft({ ...draft, message: event.target.value });
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
      <p role="alert" className="text-small text-fg-muted">
        {notStarted}
      </p>
    </form>
  );
}

function focusMessage(ref: Ref<HTMLTextAreaElement>): void {
  if (typeof ref === "object" && ref !== null) ref.current?.focus();
}
