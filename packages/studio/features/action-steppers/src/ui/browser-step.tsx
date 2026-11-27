import {
  Button,
  type ButtonUnavailable,
  Field,
  Input,
  useWriteClipboard,
} from "@halonicjs/studio-kit";
import { useState } from "react";
import { checkPastedResult } from "../pasted-result.ts";
import type { StepAction, StepperActions, StepperRequester } from "../stepper-view.ts";
import { focusMarks } from "./stepper-changes.ts";
import {
  browserWords,
  instructionsText,
  pastedResultWords,
  resultHintText,
  sourceText,
} from "./stepper-words.ts";

type BrowserAction = Extract<StepAction, { readonly kind: "browser" }>;

/** Props for {@link BrowserInstructions}. */
export interface BrowserInstructionsProps {
  readonly action: BrowserAction;
  readonly requester: StepperRequester;
}

/**
 * A browser step's page and numbered instructions (`action-steppers.browser`), under the label that
 * says where they come from: "Checked on <date>" for a library step, "From the service's docs, not
 * checked on the page" for one written from docs (`action-steppers.browser-docs`), "Instructions
 * from <requester>, not checked by Halonic" for the requester's own words. The instructions are
 * text nodes, never Markdown.
 */
export function BrowserInstructions({ action, requester }: BrowserInstructionsProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-fg-muted">{sourceText(action.source, requester)}</p>
      <p className="font-mono text-small text-fg wrap-break-word">{action.address}</p>
      <ol className="list-decimal pl-5 text-body text-fg">
        {action.instructions.map((line, index) => (
          // The lines are the requester's text and may repeat, so their place is their key; the
          // list never reorders.
          <li key={index} className="wrap-break-word whitespace-pre-wrap">
            {line}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * **Copy instructions**, written out and as big as **Open the page** beside it (HAL-17491 8.4).
 * The kit's CopyButton only ever shows "Copy", so this is a Button with the same words for
 * "Copied" and for a clipboard that refuses, said in a status line under the row.
 */
function CopyInstructions({ text }: { readonly text: string }) {
  const writeClipboard = useWriteClipboard();
  const [copied, setCopied] = useState<boolean>();
  // A new copy is announced again, even when it says the same as the last one.
  const [attempt, setAttempt] = useState(0);
  let said = "";
  if (copied !== undefined) said = copied ? browserWords.copied : browserWords.notCopied;
  return (
    <>
      <Button
        onClick={async () => {
          setCopied(await writeClipboard(text));
          setAttempt((previous) => previous + 1);
        }}
      >
        {browserWords.copy}
      </Button>
      {/* Empty, it stays as a live region but takes no line of the row. */}
      <p role="status" className={said === "" ? "sr-only" : "basis-full text-small text-fg-muted"}>
        <span key={attempt}>{said}</span>
      </p>
    </>
  );
}

/** The text "Copy instructions" copies: on a requester's step it starts with the "not checked" label. */
function copiedText(action: BrowserAction, requester: StepperRequester): string {
  const label = action.source.kind === "requester" ? sourceText(action.source, requester) : null;
  return instructionsText(label, action.address, action.instructions);
}

/**
 * A browser step while the request can only be reviewed (`action-steppers.review-mode`): only
 * **Copy instructions**, since only the desktop app opens the page.
 */
export function BrowserCopy({ action, requester }: BrowserInstructionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <CopyInstructions text={copiedText(action, requester)} />
    </div>
  );
}

/** Props for {@link BrowserControls}. */
export interface BrowserControlsProps {
  readonly number: number;
  readonly action: BrowserAction;
  readonly requester: StepperRequester;
  readonly actions: StepperActions;
  /** Set while a step runs: **Step 2 is done** waits for it, and says why. */
  readonly waits: ButtonUnavailable | undefined;
}

/**
 * The next browser step's controls: **Open the page**, **Copy instructions** (the copied text
 * starts with the "not checked" label on a requester's step, HAL-17491 8.4), the optional
 * paste-back field, which is never secret, and **Step 2 is done**. Once the step before is done,
 * focus comes to **Open the page**. A pasted value that looks like a key or doesn't match the
 * step's pattern says why under the field, and the step isn't recorded
 * (`action-steppers.pasted-result`); a new paste clears the reason.
 */
export function BrowserControls({
  number,
  action,
  requester,
  actions,
  waits,
}: BrowserControlsProps) {
  const [result, setResult] = useState("");
  const [refused, setRefused] = useState<keyof typeof pastedResultWords>();
  const fromRequester = action.source.kind === "requester";
  const confirm = () => {
    if (action.resultLabel === undefined) {
      actions.confirmBrowserStep(number, undefined);
      return;
    }
    const pasted = checkPastedResult(result, action.resultPattern);
    if (pasted.kind === "refused") {
      setRefused(pasted.reason);
      return;
    }
    actions.confirmBrowserStep(number, pasted.kind === "kept" ? pasted.value : undefined);
  };
  return (
    <div data-focus={focusMarks.stepControls} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => actions.openPage(action.address)}>{browserWords.open}</Button>
        <CopyInstructions text={copiedText(action, requester)} />
      </div>
      {action.resultLabel === undefined ? null : (
        <Field
          label={action.resultLabel}
          hint={fromRequester ? resultHintText(requester) : undefined}
          error={refused === undefined ? null : pastedResultWords[refused]}
        >
          <Input
            autoComplete="off"
            spellCheck={false}
            value={result}
            onChange={(event) => {
              setResult(event.target.value);
              setRefused(undefined);
            }}
          />
        </Field>
      )}
      <div>
        <Button
          variant="primary"
          unavailable={waits}
          onClick={() => (waits !== undefined ? undefined : confirm())}
        >
          {browserWords.done(number)}
        </Button>
      </div>
    </div>
  );
}
