import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  inlineLinkClasses,
  PlusIcon,
  TextArea,
} from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useRef, useState } from "react";
import type { AgentSettings, AgentStep, AgentsHost } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";

/** Props for {@link AgentStepsPage}. */
export interface AgentStepsPageProps {
  /** The host, for adding an agent step. */
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
  /** Opens an agent step as a card on top of the panel; absent where there are no cards. */
  readonly openAgentStep?: ((step: AgentStep) => void) | undefined;
}

/**
 * The Agent steps page (`agents.configuration.agent-steps`, flow-agents 5.2): the agent's agent
 * steps, each with its name and its description in one line, and **New agent step**. With none,
 * the page is the titled Empty state of microcopy 8.5. A new agent step opens as its card.
 */
export function AgentStepsPage({ host, settings, openAgentStep }: AgentStepsPageProps) {
  const [adding, setAdding] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const steps = settings.agentSteps;
  const dialog = adding && (
    <NewAgentStepDialog
      create={async (step) => {
        const id = await host.addAgentStep(settings, step);
        setAdding(false);
        openAgentStep?.({ id, instructions: step.instructions });
      }}
      onCancel={() => setAdding(false)}
      returnFocus={() => newButton.current}
    />
  );
  if (steps.length === 0) {
    return (
      <>
        <EmptyState
          headingLevel={3}
          title={words.noAgentStepsTitle}
          description={words.noAgentStepsText}
          action={{ label: words.newAgentStep, onClick: () => setAdding(true) }}
        />
        {dialog}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border">
        {steps.map((step) => (
          <li key={step.id} className="flex min-w-0 flex-col gap-0.5 py-2">
            {openAgentStep === undefined ? (
              <span className="text-body text-fg">{step.id}</span>
            ) : (
              <button
                type="button"
                className={`self-start ${inlineLinkClasses}`}
                onClick={() => openAgentStep(step)}
              >
                {step.id}
              </button>
            )}
            {step.description !== undefined && step.description !== "" && (
              <span className="truncate text-small text-fg-muted">{step.description}</span>
            )}
          </li>
        ))}
      </ul>
      <div>
        <Button
          ref={newButton}
          variant="secondary"
          size="sm"
          icon={<PlusIcon />}
          onClick={() => setAdding(true)}
        >
          {words.newAgentStep}
        </Button>
      </div>
      {dialog}
    </div>
  );
}

/**
 * "New agent step": a name and what it should do. **Create** stays pressable and says what is
 * missing under the field, since the file can't hold an agent step without instructions.
 */
function NewAgentStepDialog({
  create,
  onCancel,
  returnFocus,
}: {
  readonly create: (step: { name: string; instructions: string }) => Promise<void>;
  readonly onCancel: () => void;
  readonly returnFocus: () => HTMLElement | null;
}) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [nameProblem, setNameProblem] = useState<string>();
  const [instructionsProblem, setInstructionsProblem] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const instructionsField = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    setFailure(undefined);
    const noName = name.trim() === "";
    const noInstructions = instructions.trim() === "";
    setNameProblem(noName ? words.agentStepNameMissing : undefined);
    setInstructionsProblem(noInstructions ? words.agentStepInstructionsMissing : undefined);
    if (noName) nameField.current?.focus();
    else if (noInstructions) instructionsField.current?.focus();
    if (noName || noInstructions) return;
    setBusy(true);
    try {
      await create({ name: name.trim(), instructions });
    } catch (error) {
      setFailure(words.agentStepCreateFailed(errorReasonFor(error).replace(/\.$/, "")));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={words.newAgentStep}
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
        <Field label={words.agentStepName} error={nameProblem ?? null}>
          <Input
            ref={nameField}
            autoFocus
            readOnly={busy}
            value={name}
            onChange={(event) => {
              setNameProblem(undefined);
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label={words.agentStepInstructions} error={instructionsProblem ?? null}>
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
      </div>
    </Dialog>
  );
}
