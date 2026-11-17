import { Dialog, Field, Input, Select } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useRef, useState } from "react";
import type { NewSkillHost } from "../new-skill-host.ts";
import { newSkillWords } from "../new-skill-words.ts";
import type { SkillRef } from "../skill-host.ts";

/** The props of {@link NewSkillDialog}. */
export interface NewSkillDialogProps {
  readonly host: NewSkillHost;
  /** After the skill is made: the caller opens its page. */
  readonly onCreated: (skill: SkillRef) => void;
  readonly onCancel: () => void;
  readonly returnFocus?: () => HTMLElement | null;
}

/**
 * The reason without its closing full stop, so the sentence around it has one. Only a kinded
 * refusal's own words show; anything else gives the generic sentence (microcopy 1.4, F13).
 */
function reasonOf(error: unknown): string {
  return errorReasonFor(error).replace(/\.$/, "");
}

/**
 * "New skill" (`library.new-skill`): Name, Hub (only with more than one) and "When to use it", with
 * the skill's folder under Name. **Create** stays pressable while a field is empty and shows what
 * is missing under it, the name first.
 *
 * @example
 * <NewSkillDialog host={host} onCreated={openSkill} onCancel={close} />
 */
export function NewSkillDialog({ host, onCreated, onCancel, returnFocus }: NewSkillDialogProps) {
  const hubs = host.hubs();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hub, setHub] = useState<string | null>(hubs[0]?.id ?? null);
  const [asked, setAsked] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const descriptionField = useRef<HTMLInputElement>(null);
  const draft = { name, description, hub };

  async function create() {
    setAsked(true);
    setFailure(undefined);
    if (name.trim() === "") return nameField.current?.focus();
    if (description.trim() === "") return descriptionField.current?.focus();
    setBusy(true);
    try {
      onCreated(await host.create(draft));
    } catch (error) {
      setFailure(newSkillWords.failed(reasonOf(error)));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={newSkillWords.title}
      size="md"
      form
      confirm={{ label: newSkillWords.create, busyLabel: newSkillWords.creating }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure, retryLabel: newSkillWords.retry })}
      onConfirm={() => void create()}
      onCancel={onCancel}
      {...(returnFocus === undefined ? {} : { returnFocus })}
    >
      <div className="flex flex-col gap-3">
        <Field
          label={newSkillWords.name}
          hint={newSkillWords.folder(host.folder(draft))}
          error={asked && name.trim() === "" ? newSkillWords.nameMissing : null}
        >
          <Input
            ref={nameField}
            autoFocus
            disabled={busy}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {hubs.length > 1 && (
          <Field label={newSkillWords.hub}>
            <Select
              options={hubs.map((each) => ({ value: each.id, label: each.name }))}
              value={hub ?? ""}
              onChange={setHub}
            />
          </Field>
        )}
        <Field
          label={newSkillWords.description}
          error={asked && description.trim() === "" ? newSkillWords.descriptionMissing : null}
        >
          <Input
            ref={descriptionField}
            disabled={busy}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
