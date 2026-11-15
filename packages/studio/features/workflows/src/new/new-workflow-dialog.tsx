import { Dialog, Field, InfoIcon, Input, Select } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { NewWorkflow, WorkflowHub, WorkflowRef } from "../api.ts";
import { newWorkflowWords as words } from "./new-workflow-words.ts";
import { workflowFilePath } from "./workflow-file.ts";

/** The props of {@link NewWorkflowDialog}. */
export interface NewWorkflowDialogProps {
  readonly hubs: readonly WorkflowHub[];
  /** The ids already used in each hub, so the file line can show the `-2` name. */
  readonly takenIds: (hubId: string) => readonly string[];
  /** Makes the workflow; rejects with the reason it couldn't be written. */
  readonly create: (newWorkflow: NewWorkflow) => Promise<WorkflowRef>;
  /** After the workflow is written: the caller opens it in its tab. */
  readonly onCreated: (ref: WorkflowRef) => void;
  readonly onCancel: () => void;
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * "New workflow" (`workflows.create`): a name, a hub when there is more than one, and the file the
 * workflow will be written to. **Create** stays pressable while the name is empty and says what is
 * wrong under the field. The workflow starts as `start → done`; its page is where the user
 * says what the first step does.
 *
 * @example
 * <NewWorkflowDialog hubs={hubs} takenIds={ids} create={host.create} onCreated={open} onCancel={close} />
 */
export function NewWorkflowDialog({
  hubs,
  takenIds,
  create,
  onCreated,
  onCancel,
  returnFocus,
}: NewWorkflowDialogProps) {
  const [name, setName] = useState("");
  const [hubId, setHubId] = useState(hubs[0]?.id ?? "");
  const [problem, setProblem] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);

  const file = workflowFilePath(hubId, name, takenIds(hubId));
  const fileLine = file.kind === "file" ? words.file(file.path) : words.folder(file.path);

  async function submit() {
    setFailure(undefined);
    if (name.trim() === "") {
      setProblem(words.nameMissing);
      nameField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      onCreated(await create({ name: name.trim(), hubId }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setFailure(words.createFailed(reason.replace(/\.$/, "")));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={words.title}
      size="md"
      form
      confirm={{ label: words.create, busyLabel: words.creating }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void submit()}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-3">
        <div className={hubs.length > 1 ? "grid grid-cols-[1fr_160px] gap-3" : "grid gap-3"}>
          <Field label={words.nameField} error={problem ?? null} hint={fileLine}>
            <Input
              ref={nameField}
              autoFocus
              disabled={busy}
              value={name}
              onChange={(event) => {
                setProblem(undefined);
                setName(event.target.value);
              }}
            />
          </Field>
          {hubs.length > 1 && (
            <Field label={words.hubField}>
              <Select
                options={hubs.map((hub) => ({ value: hub.id, label: hub.name }))}
                value={hubId}
                onChange={setHubId}
              />
            </Field>
          )}
        </div>
        <p className="flex items-center gap-2 text-small text-fg-muted">
          <span className="text-fg-subtle" aria-hidden>
            <InfoIcon />
          </span>
          {words.startsWith}
        </p>
      </div>
    </Dialog>
  );
}
