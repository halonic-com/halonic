import { Button, type ButtonUnavailable, CopyButton, Field, Input } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { StepAction, StepperActions, StepperRequester } from "../stepper-view.ts";
import { browserWords, instructionsText, sourceText } from "./stepper-words.ts";

type BrowserAction = Extract<StepAction, { readonly kind: "browser" }>;

/** Props for {@link BrowserInstructions}. */
export interface BrowserInstructionsProps {
  readonly action: BrowserAction;
  readonly requester: StepperRequester;
}

/**
 * A browser step's page and numbered instructions (`action-steppers.browser`), under the label that
 * says where they come from: "Checked on <date>" for a library step, "Instructions from
 * <requester>, not checked by Halonic" for the requester's own words. The instructions are text
 * nodes, never Markdown.
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
 * paste-back field, which is never secret, and **Step 2 is done**.
 */
export function BrowserControls({
  number,
  action,
  requester,
  actions,
  waits,
}: BrowserControlsProps) {
  const [result, setResult] = useState("");
  const label = action.source.kind === "requester" ? sourceText(action.source, requester) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => actions.openPage(action.address)}>{browserWords.open}</Button>
        <CopyButton
          text={instructionsText(label, action.address, action.instructions)}
          label={browserWords.copy}
        />
      </div>
      {action.resultLabel === undefined ? null : (
        <Field label={action.resultLabel}>
          <Input
            autoComplete="off"
            spellCheck={false}
            value={result}
            onChange={(event) => setResult(event.target.value)}
          />
        </Field>
      )}
      <div>
        <Button
          variant="primary"
          unavailable={waits}
          onClick={() =>
            waits !== undefined
              ? undefined
              : actions.confirmBrowserStep(
                  number,
                  action.resultLabel === undefined ? undefined : result.trim(),
                )
          }
        >
          {browserWords.done(number)}
        </Button>
      </div>
    </div>
  );
}
