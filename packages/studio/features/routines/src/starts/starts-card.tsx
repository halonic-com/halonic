import { Callout, Card, Field, Select, TextArea } from "@halonicjs/studio-kit";
import { useState } from "react";
import type {
  RoutinesHost,
  RoutineTarget,
  RoutineTargetChoice,
  RoutineTrigger,
  RoutineView,
} from "../api.ts";
import { failureReason } from "../page/page-words.ts";
import { startsWords as words } from "./starts-words.ts";
import { useTargets } from "./use-targets.ts";

/** What a new agent target is asked to do until the person writes more; the same text `create` uses. */
const DEFAULT_PROMPT = "Describe what to do.";

/** Props for {@link StartsCard}. */
export interface StartsCardProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
}

/**
 * The Starts card (`routines.starts.starts-card`): a picker of the workflows and agents the
 * routine's hub lets it start, the workflow's Input as JSON or the agent's Prompt, the
 * placeholders the text may use, and one line when the target can't be started. Each change is
 * written as soon as it can be; a change that can't be saved is shown in the card.
 */
export function StartsCard({ host, routine }: StartsCardProps) {
  const targets = useTargets(host, routine);
  const [failure, setFailure] = useState<string | undefined>();
  const { target } = routine;
  const current = targets.find((choice) => sameTarget(choice, target));
  const name = current?.name ?? target.id;

  const save = async (next: RoutineTarget) => {
    setFailure(undefined);
    try {
      await host.save(routine, { target: next });
    } catch (error) {
      setFailure(words.couldntSave(failureReason(error)));
    }
  };
  const pick = (key: string) => {
    const choice = targets.find((candidate) => targetKey(candidate) === key);
    if (choice === undefined || sameTarget(choice, target)) return;
    void save(
      choice.kind === "workflow"
        ? { kind: "workflow", hubId: choice.hubId, id: choice.id, input: "{}" }
        : { kind: "agent", hubId: choice.hubId, id: choice.id, prompt: DEFAULT_PROMPT },
    );
  };
  const options = [
    ...targets.map((choice) => ({
      value: targetKey(choice),
      label: (choice.kind === "workflow" ? words.workflowOption : words.agentOption)(choice.name),
    })),
  ];
  return (
    <Card label={words.label}>
      <div className="flex flex-col gap-3">
        <Field label={words.pick}>
          <Select
            options={options}
            value={current === undefined ? "" : targetKey(current)}
            placeholder={target.id}
            onChange={pick}
          />
        </Field>
        <TargetState routine={routine} name={name} />
        {target.kind === "workflow" ? (
          <InputField input={target.input} onChange={(input) => void save({ ...target, input })} />
        ) : (
          <PromptField
            prompt={target.prompt}
            onChange={(prompt) => void save({ ...target, prompt })}
          />
        )}
        <p className="text-small text-fg-muted">
          {words.placeholders(placeholdersFor(routine.trigger))}
        </p>
        {failure !== undefined && <Callout tone="danger">{failure}</Callout>}
      </div>
    </Card>
  );
}

/** The one line about a target that can't be started; nothing for one that can. */
function TargetState({ routine, name }: { readonly routine: RoutineView; readonly name: string }) {
  switch (routine.targetState) {
    case "not-found":
      return (
        <p className="text-small">
          <span className="text-danger">{routine.target.id}</span>{" "}
          <span className="text-fg-muted">{words.notFound}</span>
        </p>
      );
    case "never-live":
      return <p className="text-small text-fg-muted">{words.neverLive(name)}</p>;
    case "in-trash":
      return <p className="text-small text-fg-muted">{words.inTrash(name)}</p>;
    case "ready":
      return null;
  }
}

/** The workflow's input: written once it is JSON; text that isn't says so when the field is left. */
function InputField({
  input,
  onChange,
}: {
  readonly input: string;
  readonly onChange: (input: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();
  const [left, setLeft] = useState(false);
  const text = draft ?? input;
  const valid = isJson(text);
  const change = (next: string) => {
    setDraft(next);
    setLeft(false);
    if (isJson(next)) onChange(next.trim());
  };
  return (
    <Field label={words.input} hint={words.inputHint} error={left && !valid ? words.notJson : null}>
      <TextArea
        value={text}
        spellCheck={false}
        minRows={2}
        onChange={(event) => change(event.target.value)}
        onBlur={() => {
          setLeft(true);
          // What was written is what the field shows again; text that isn't JSON stays to be fixed.
          if (valid) setDraft(undefined);
        }}
      />
    </Field>
  );
}

/** The agent's prompt: written as it is typed, and never emptied. */
function PromptField({
  prompt,
  onChange,
}: {
  readonly prompt: string;
  readonly onChange: (prompt: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();
  const text = draft ?? prompt;
  const change = (next: string) => {
    setDraft(next);
    if (next.trim() !== "") onChange(next);
  };
  return (
    <Field label={words.prompt} error={text.trim() === "" ? words.promptNeeded : null}>
      <TextArea
        value={text}
        minRows={3}
        onChange={(event) => change(event.target.value)}
        onBlur={() => setDraft(undefined)}
      />
    </Field>
  );
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function targetKey(choice: Pick<RoutineTargetChoice, "kind" | "hubId" | "id">): string {
  return JSON.stringify([choice.kind, choice.hubId, choice.id]);
}

function sameTarget(
  choice: Pick<RoutineTargetChoice, "kind" | "hubId" | "id">,
  target: RoutineTarget,
): boolean {
  return targetKey(choice) === targetKey(target);
}

/** The placeholders the text may use: every run has the time and the last run; mail and signals add theirs. */
function placeholdersFor(trigger: RoutineTrigger): readonly string[] {
  const names = ["trigger.at", "trigger.lastRun"];
  if (trigger.kind === "mail") names.push("trigger.message");
  if (trigger.kind === "signal") names.push("trigger.signal");
  return names;
}
