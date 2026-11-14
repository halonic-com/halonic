import { Button, Dialog, Field, Input, SecretText } from "@halonicjs/studio-kit";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { SecretReplaceAnswer } from "../api.ts";
import {
  fieldWords,
  type KeptOn,
  keptLine,
  replaceAccepted,
  replacedNow,
  replaceNoNetwork,
  replaceRefused,
  savedOn,
  secretSaveFailed,
} from "./secret-words.ts";

/** Why the last send didn't take, which decides the sentence under the field. */
type Problem = "failed" | "refused" | "no-network";

const problemText: Readonly<Record<Problem, string>> = {
  failed: secretSaveFailed,
  refused: replaceRefused,
  "no-network": replaceNoNetwork,
};

/** What was said when the last replacement went through, until the next one starts. */
function answerText(answer: SecretReplaceAnswer): string | null {
  if (answer.kind === "accepted") return replaceAccepted(answer.usedBy);
  if (answer.kind === "replaced") return replacedNow;
  return null;
}

/** What a parent can do to the secret field: put the cursor in it. */
export interface SecretFieldHandle {
  /** Moves focus to the input. It does nothing while the field shows "Saved", which has no input. */
  focus(): void;
}

/** Props for {@link SecretField}. */
export interface SecretFieldProps {
  /** When the secret was saved, from the setup record, or `null` while none is. */
  readonly savedAt: string | null;
  readonly keptOn: KeptOn;
  /** Served over plain http: the first save asks first, because the secret travels unencrypted. */
  readonly plainHttp: boolean;
  readonly answering: boolean;
  readonly handle: Ref<SecretFieldHandle>;
  /** Sends the secret to the secret store. It rejects when it can't be saved. */
  readonly onSave: (secret: SecretText) => Promise<void>;
  /**
   * Sends a new secret to be checked and swapped in (design 4.3). It rejects when the engine
   * can't do it, and answers what Google said otherwise.
   */
  readonly onReplace: (secret: SecretText) => Promise<SecretReplaceAnswer>;
  /** The setup hasn't been signed in yet, so a new secret replaces the old one at once. */
  readonly beforeFirstSignIn: boolean;
  /** Opens already in **Replace secret**'s field: Google refused the saved secret. */
  readonly startReplacing: boolean;
  /** The link to the client's page in Google Cloud, shown next to **Replace secret**. */
  readonly clientsLink: ReactNode;
  /** Told whether the input holds unsaved text, so the checklist doesn't move on and drop it. */
  readonly onTyped: (hasText: boolean) => void;
}

/**
 * The client secret, write-only (design 4.1). The input is masked and has no show or copy button.
 * What is typed stays in the input and nowhere else: not in React state, not in a draft. The
 * value becomes a `SecretText` for the one request that saves it, and the input is cleared as soon
 * as that succeeds. Once saved, all Studio shows is "Saved" and the date: never a preview, a
 * length or a hash.
 */
export function SecretField(props: SecretFieldProps) {
  const { savedAt, keptOn, plainHttp, answering, handle, onSave, onTyped } = props;
  const { onReplace, beforeFirstSignIn, startReplacing, clientsLink } = props;
  const input = useRef<HTMLInputElement>(null);
  const reason = useId();
  // Only whether something is typed, never what, so Save knows if it can go on.
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Whether the field is a new secret for a saved one, and what Google said to the last one.
  const [replacing, setReplacing] = useState(startReplacing);
  const [answer, setAnswer] = useState<string | null>(null);
  const replaceButton = useRef<HTMLButtonElement>(null);
  const answerLine = useRef<HTMLParagraphElement>(null);
  // Where focus goes once the view for the new state has rendered.
  const focusNext = useRef<"input" | "replace" | "answer" | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The plain-http question is asked on the first save only, not again on **Try again**.
  const [confirmed, setConfirmed] = useState(false);
  useImperativeHandle(handle, () => ({ focus: () => input.current?.focus() }));
  useEffect(() => {
    onTyped(hasText);
  }, [hasText, onTyped]);
  useEffect(
    () => () => {
      onTyped(false);
    },
    [onTyped],
  );
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next === "input") input.current?.focus();
    else if (next === "replace") replaceButton.current?.focus();
    else if (next === "answer") answerLine.current?.focus();
  }, [replacing, savedAt]);

  async function send() {
    const field = input.current;
    const value = field?.value.trim() ?? "";
    if (field === null || value === "" || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (replacing) {
        const result = await onReplace(new SecretText(value));
        if (result.kind === "refused" || result.kind === "no-network") {
          // The old secret is still in use and the field stays open, with what was typed.
          setProblem(result.kind);
          field.focus();
          return;
        }
        setAnswer(answerText(result));
        setReplacing(false);
        focusNext.current = "answer";
      } else {
        await onSave(new SecretText(value));
        setAnswer(null);
      }
      field.value = "";
      setHasText(false);
      // A later secret is a new send, so it asks again.
      setConfirmed(false);
    } catch {
      // The typed value stays in the input so the user can try again. The error never repeats it.
      setProblem("failed");
      field.focus();
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!answering || !hasText || busy) return;
    if (plainHttp && !confirmed) setConfirming(true);
    else void send();
  }

  const status =
    savedAt === null ? (
      <span className="text-small text-fg-muted">
        <span aria-hidden="true">○ </span>Not saved
      </span>
    ) : (
      <span className="text-small text-fg-muted">
        <span aria-hidden="true">● </span>Saved<span aria-hidden="true"> · </span>
        <span className="sr-only">, </span>
        {savedOn(savedAt)}
      </span>
    );
  const heading = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span aria-hidden="true" className="text-caption text-fg-muted">
        Client secret
      </span>
      {status}
    </div>
  );
  if (savedAt !== null && !replacing) {
    return (
      <SavedSecret
        heading={heading}
        keptOn={keptOn}
        clientsLink={clientsLink}
        answer={answer}
        replaceButton={replaceButton}
        answerLine={answerLine}
        onReplace={() => {
          setAnswer(null);
          focusNext.current = "input";
          setReplacing(true);
        }}
      />
    );
  }

  const words = fieldWords({
    replacing,
    beforeFirstSignIn,
    keptOn,
    retry: problem === "failed" || problem === "no-network",
    answering,
  });
  const canSave = answering && hasText;
  return (
    <>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {heading}
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <Field
              label="Client secret"
              hideLabel
              hint={words.hint}
              error={problem === null ? null : problemText[problem]}
            >
              <Input
                ref={input}
                type="password"
                autoComplete="new-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore=""
                data-lpignore="true"
                onChange={(event) => {
                  setHasText(event.target.value.trim() !== "");
                  setProblem(null);
                }}
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            busyLabel="Saving…"
            unavailable={canSave ? undefined : { reason }}
          >
            {words.button}
          </Button>
          {replacing ? (
            <Button
              variant="ghost"
              onClick={() => {
                // Nothing typed is kept: a cancelled secret doesn't linger in the input.
                if (input.current !== null) input.current.value = "";
                setHasText(false);
                setProblem(null);
                focusNext.current = "replace";
                setReplacing(false);
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
        {canSave ? null : (
          <p id={reason} className="text-small text-fg-muted">
            {words.unavailable}
          </p>
        )}
        {problem === null ? null : (
          <p role="alert" className="sr-only">
            {problemText[problem]}
          </p>
        )}
      </form>
      {confirming ? (
        <Dialog
          title="Send the secret without encryption?"
          confirm={{ label: "Save it anyway", variant: "danger", busyLabel: "Saving…" }}
          onConfirm={() => {
            setConfirming(false);
            setConfirmed(true);
            void send();
          }}
          onCancel={() => setConfirming(false)}
          returnFocus={() => input.current}
        >
          <p>
            This page is served over plain http, so anyone on your network could read the secret as
            it is sent. Save it on the computer that runs Halonic instead, or serve Studio over
            https.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}

interface SavedSecretProps {
  readonly heading: ReactNode;
  readonly keptOn: KeptOn;
  readonly clientsLink: ReactNode;
  /** What Google said to the last replacement, until the next one starts. */
  readonly answer: string | null;
  readonly replaceButton: Ref<HTMLButtonElement>;
  readonly answerLine: Ref<HTMLParagraphElement>;
  readonly onReplace: () => void;
}

/** A saved secret: "Saved" with its date, where it is kept, and **Replace secret**. No input. */
function SavedSecret(props: SavedSecretProps) {
  const { heading, keptOn, clientsLink, answer } = props;
  return (
    <div className="flex flex-col gap-1">
      <span className="sr-only">Client secret</span>
      {heading}
      <p className="text-caption text-fg-subtle">{keptLine(keptOn)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" ref={props.replaceButton} onClick={props.onReplace}>
          Replace secret
        </Button>
        {clientsLink}
      </div>
      {answer === null ? null : (
        <p ref={props.answerLine} tabIndex={-1} role="status" className="text-small text-fg-muted">
          {answer}
        </p>
      )}
    </div>
  );
}
