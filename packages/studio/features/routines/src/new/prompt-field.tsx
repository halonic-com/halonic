import { Field, TextArea } from "@halonicjs/studio-kit";
import type { Ref } from "react";
import { newRoutineWords as words } from "./new-routine-words.ts";

/**
 * What the agent a new routine runs is asked to do, in the New routine dialog and under a Triggers
 * section's **Add trigger**: empty until the person types it, with the hint as a placeholder only,
 * since a stand-in would be saved as the agent's real task.
 */
export function PromptField({
  ref,
  agentName,
  prompt,
  missing,
  busy,
  onChange,
}: {
  readonly ref: Ref<HTMLTextAreaElement>;
  readonly agentName: string;
  readonly prompt: string;
  /** The person tried to make the routine while it was empty. */
  readonly missing: boolean;
  readonly busy: boolean;
  readonly onChange: (prompt: string) => void;
}) {
  return (
    <Field
      label={words.promptField}
      hint={prompt.trim() === "" ? words.promptNeeded(agentName) : null}
      error={missing ? words.promptNeeded(agentName) : null}
    >
      <TextArea
        ref={ref}
        readOnly={busy}
        value={prompt}
        placeholder={words.promptPlaceholder}
        minRows={3}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
