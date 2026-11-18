import { findSecretShape } from "@halonicjs/std";
import {
  Dialog,
  Field,
  InfoIcon,
  Input,
  Select,
  TextArea,
  usePresentation,
} from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import type { AgentHub, AgentRef, NewAgent } from "../api.ts";
import { agentFilePath } from "./agent-file.ts";
import { newAgentWords as words } from "./new-agent-words.ts";

/** The props of {@link NewAgentDialog}. */
export interface NewAgentDialogProps {
  readonly hubs: readonly AgentHub[];
  /** The ids already used in each hub, so the file line can show the `-2` name. */
  readonly takenIds: (hubId: string) => readonly string[];
  /** Makes the agent; rejects with the reason it couldn't be written. */
  readonly create: (newAgent: NewAgent) => Promise<AgentRef>;
  /** After the agent is written: the caller opens it in its tab. */
  readonly onCreated: (ref: AgentRef) => void;
  readonly onCancel: () => void;
  /** The model a new agent of the hub starts with; `undefined` when there is none, so the dialog says so. */
  readonly defaultModelOf: (hubId: string) => Promise<string | undefined>;
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * "New agent" (`agents.new.create`): a name, a hub when there is more than one, and the file the
 * agent will be written to. **Create** stays pressable while the name is empty and says what is
 * wrong under the field. A short **What should it do?** box becomes its instructions; it can stay empty and be written on the agent's page.
 *
 * @example
 * <NewAgentDialog hubs={hubs} takenIds={ids} create={host.create} onCreated={open} onCancel={close} />
 */
export function NewAgentDialog({
  hubs,
  takenIds,
  create,
  onCreated,
  onCancel,
  defaultModelOf,
  returnFocus,
}: NewAgentDialogProps) {
  const [name, setName] = useState("");
  const [chosenHub, setHubId] = useState(hubs[0]?.id ?? "");
  // The hubs can arrive or change while the dialog is open; a hub that's gone falls back to the first.
  const hubId = hubs.some((hub) => hub.id === chosenHub) ? chosenHub : (hubs[0]?.id ?? "");
  const phone = usePresentation() === "phone";
  // Whether the picked hub has a default model: unknown until the read answers, or when it fails.
  const [hasDefaultModel, setHasDefaultModel] = useState<boolean>();
  useEffect(() => {
    let current = true;
    setHasDefaultModel(undefined);
    defaultModelOf(hubId).then(
      (model) => current && setHasDefaultModel(model !== undefined),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [defaultModelOf, hubId]);
  const [instructions, setInstructions] = useState("");
  const [instructionsProblem, setInstructionsProblem] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const instructionsField = useRef<HTMLTextAreaElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  const file = agentFilePath(hubId, name, takenIds(hubId));
  const fileText = file.kind === "file" ? words.file(file.path) : words.folder(file.path);
  // The phone sheet has no room for the file line (microcopy 8.2).
  const fileLine = phone ? undefined : fileText;
  const modelNote = hasDefaultModel ? words.startNote : words.noModel;
  const note = hasDefaultModel === undefined ? undefined : modelNote;

  async function submit() {
    setFailure(undefined);
    if (name.trim() === "") {
      setProblem(words.nameMissing);
      nameField.current?.focus();
      return;
    }
    // A key typed here would be saved into the agent's file, so it is caught first (save model 8.4).
    if (findSecretShape(instructions) !== undefined) {
      setInstructionsProblem(words.looksLikeKey);
      instructionsField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const written = instructions.trim();
      onCreated(await create({ name: name.trim(), hubId, instructions: written }));
    } catch (error) {
      const reason = errorReasonFor(error);
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
      retryLabel={words.tryAgain}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void submit()}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-3">
        <div className={hubs.length > 1 ? "grid grid-cols-[1fr_160px] gap-3" : "grid gap-3"}>
          <Field
            label={words.nameField}
            error={problem ?? null}
            {...(fileLine === undefined ? {} : { hint: fileLine })}
          >
            <Input
              ref={nameField}
              autoFocus
              readOnly={busy}
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
        <Field
          label={words.instructionsField}
          hint={words.instructionsHint}
          error={instructionsProblem ?? null}
        >
          <TextArea
            ref={instructionsField}
            minRows={3}
            maxRows={6}
            readOnly={busy}
            value={instructions}
            onChange={(event) => {
              setInstructionsProblem(undefined);
              setInstructions(event.target.value);
            }}
          />
        </Field>
        {note !== undefined && (
          <p className="flex items-start gap-2 text-small text-fg-muted">
            {/* The icon has no size of its own, so in a flex row it needs one; it sits on the first line. */}
            <span className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden>
              <InfoIcon />
            </span>
            {note}
          </p>
        )}
      </div>
    </Dialog>
  );
}
