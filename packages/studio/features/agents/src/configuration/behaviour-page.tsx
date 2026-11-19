import { findSecretShape } from "@halonicjs/std";
import { Field, Input, TextArea } from "@halonicjs/studio-kit";
import type { AgentChange, AgentSettings } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { useAutoSaved, useReportNotSaved } from "./use-auto-saved.ts";

/** Props for {@link BehaviourPage}. */
export interface BehaviourPageProps {
  readonly settings: AgentSettings;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Hears how many fields aren't saved, for the toolbar's "1 field not saved". */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
}

const keyCheck = (text: string): string | null =>
  findSecretShape(text) === undefined ? null : words.looksLikeKey;

/**
 * The Behaviour page (`agents.configuration.behaviour`): Description and Instructions. Each saves by
 * itself and there is no Save button. A key in either is caught before it's saved.
 */
export function BehaviourPage({ settings, save, reportNotSaved }: BehaviourPageProps) {
  const description = useAutoSaved(
    settings.description ?? "",
    (next) => save({ description: next }),
    keyCheck,
  );
  const instructions = useAutoSaved(
    settings.instructions,
    (next) => save({ instructions: next }),
    keyCheck,
  );
  useReportNotSaved(reportNotSaved, [description, instructions]);
  return (
    <div className="flex flex-col gap-6">
      <Field label={words.description} error={description.error} announceWhileFocused>
        <Input
          value={description.value}
          onChange={(event) => description.onChange(event.target.value)}
          onBlur={description.flush}
        />
      </Field>
      <Field
        label={words.instructions}
        hint={instructions.value === "" ? words.instructionsHint : undefined}
        error={instructions.error}
        announceWhileFocused
      >
        <TextArea
          minRows={4}
          maxRows={12}
          value={instructions.value}
          onChange={(event) => instructions.onChange(event.target.value)}
          onBlur={instructions.flush}
        />
      </Field>
    </div>
  );
}
