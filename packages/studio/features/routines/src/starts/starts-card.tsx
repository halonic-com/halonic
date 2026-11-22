import {
  Callout,
  Card,
  Disclosure,
  Field,
  Select,
  TextArea,
  usePresentation,
} from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import {
  agentCantRunWords,
  type RoutineStartField,
  type RoutinesHost,
  type RoutineTarget,
  type RoutineTargetChoice,
  type RoutineTrigger,
  type RoutineView,
} from "../api.ts";
import { cantStartReason, pageStartFacts } from "../cant-start.ts";
import { failureReason } from "../page/page-words.ts";
import { startsWords as words } from "./starts-words.ts";
import { useTargets } from "./use-targets.ts";

/** Props for {@link StartsCard}. */
export interface StartsCardProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  /** Opens the workflow or agent in its tab, for the phone's "Open <name>" row; without it there is no row. */
  readonly openTarget?: (target: RoutineTarget) => void;
}

/**
 * The Starts card (`routines.starts.starts-card`): a picker of the workflows and agents the
 * routine's hub lets it start, the workflow's own start field with its Input as JSON under
 * Advanced (or only the JSON for a workflow without one) or the agent's Prompt, the
 * placeholders the text may use, and one line when the target can't be started. Each change is
 * written as soon as it can be; a change that can't be saved is shown in the card.
 */
export function StartsCard({ host, routine, openTarget }: StartsCardProps) {
  const targets = useTargets(host, routine);
  const [failure, setFailure] = useState<string | undefined>();
  const [picked, setPicked] = useState<RoutineTargetChoice | undefined>();
  // An agent picked but not yet written: the file keeps its target until the agent has a prompt.
  const waiting = picked !== undefined && !sameTarget(picked, routine.target) ? picked : undefined;
  const target: RoutineTarget =
    waiting === undefined
      ? routine.target
      : { kind: "agent", hubId: waiting.hubId, id: waiting.id, prompt: "" };
  // Once written, the pick is the file's target; forget it so a later change to the file shows.
  useEffect(() => {
    if (picked !== undefined && waiting === undefined) setPicked(undefined);
  }, [picked, waiting]);
  const current = targets.find((choice) => sameTarget(choice, target));
  const name = current?.name ?? target.id;
  const inputMissing = waiting === undefined ? routine.inputMissing : undefined;

  const save = async (next: RoutineTarget) => {
    setFailure(undefined);
    try {
      await host.save(routine, { target: next });
    } catch (error) {
      setFailure(words.couldntSave(failureReason(error)));
    }
  };
  // A workflow is written at once with an empty input; an agent waits for its prompt, since a
  // stand-in prompt would be saved as the agent's real task.
  const pick = (key: string) => {
    const choice = targets.find((candidate) => targetKey(candidate) === key);
    if (choice === undefined || sameTarget(choice, target)) return;
    setFailure(undefined);
    if (choice.kind === "agent") {
      setPicked(choice);
      return;
    }
    setPicked(undefined);
    // Back to the file's own workflow: nothing to write, its input stays.
    if (sameTarget(choice, routine.target)) return;
    void save({ kind: "workflow", hubId: choice.hubId, id: choice.id, input: "{}" });
  };
  const options = [
    ...targets.map((choice) => ({
      value: targetKey(choice),
      label: (choice.kind === "workflow" ? words.workflowOption : words.agentOption)(choice.name),
    })),
  ];
  return (
    <Card label={words.label} headingLevel={2}>
      <div className="flex flex-col gap-3">
        {/* An agent can't run from a routine yet (C52 claim 1.6), so the picker says so under an agent (HAL-14647). */}
        <Field label={words.pick} hint={target.kind === "agent" ? agentCantRunWords.line : null}>
          <Select
            options={options}
            value={current === undefined ? "" : targetKey(current)}
            placeholder={target.id}
            onChange={pick}
          />
        </Field>
        {current !== undefined && openTarget !== undefined && (
          <OpenTargetRow name={name} onOpen={() => openTarget(target)} />
        )}
        {waiting === undefined && (
          <>
            <TargetState
              routine={routine}
              name={name}
              shownByField={
                startFieldShowsMissing(target, current?.start) ? inputMissing : undefined
              }
            />
            {routine.live !== undefined && routine.live.targetName !== routine.targetName && (
              <p className="text-small text-fg-muted">
                {words.newTargetNotLive(routine.live.targetName)}
              </p>
            )}
          </>
        )}
        {target.kind === "workflow" ? (
          <WorkflowInput
            name={name}
            start={current?.start}
            input={target.input}
            inputMissing={inputMissing !== undefined}
            onChange={(input) => void save({ ...target, input })}
          />
        ) : (
          <PromptField
            key={targetKey(target)}
            name={name}
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

/**
 * On a phone, a 48px row under the picker that opens what the routine starts: "Open Support
 * reply" in `accent-text` (flow-routines 5.3). Desktop has the workflow or agent in the sidebar.
 */
function OpenTargetRow({ name, onOpen }: { readonly name: string; readonly onOpen: () => void }) {
  if (usePresentation() !== "phone") return null;
  return (
    <button
      type="button"
      className="flex min-h-touch w-full items-center text-left text-body text-accent-text focus-ring"
      onClick={onOpen}
    >
      {words.open(name)}
    </button>
  );
}

/**
 * The one line about a routine that can't start or a target that can't be started; nothing for one
 * that can. Why it can't start is the sentence its list row gives: a workflow or agent that isn't
 * in the workspace, or the first error in its file (HAL-15082, HAL-15300). When that error is the
 * missing input the start field already shows as its own error, the field keeps it, next to where
 * it is fixed, and this line leaves it out so it shows once (HAL-15721).
 */
function TargetState({
  routine,
  name,
  shownByField,
}: {
  readonly routine: RoutineView;
  readonly name: string;
  /** The error the start field shows itself, if any. */
  readonly shownByField: string | undefined;
}) {
  const cantStart = cantStartReason(pageStartFacts(routine));
  if (cantStart !== undefined && cantStart !== shownByField) {
    return <p className="text-small text-danger">{cantStart}</p>;
  }
  switch (routine.targetState) {
    case "never-live":
      return <p className="text-small text-fg-muted">{words.neverLive(name)}</p>;
    case "in-trash":
      return <p className="text-small text-fg-muted">{words.inTrash(name)}</p>;
    case "not-found":
    case "ready":
      return null;
  }
}

/**
 * A workflow's input. A workflow with a `start:` block gets the one field it asks for, under its
 * own label, with the whole input as JSON under Advanced. Without one, or while the input holds
 * something that field can't show, the input is only JSON.
 */
function WorkflowInput({
  name,
  start,
  input,
  inputMissing,
  onChange,
}: {
  readonly name: string;
  readonly start: RoutineStartField | undefined;
  readonly input: string;
  /** Whether the engine refuses the start because the input lacks a field its first step reads. */
  readonly inputMissing: boolean;
  readonly onChange: (input: string) => void;
}) {
  const value = start === undefined ? undefined : startValue(input, start.field);
  if (start === undefined || value === undefined) {
    return <InputField input={input} onChange={onChange} />;
  }
  return (
    <>
      <StartField
        name={name}
        start={start}
        value={value}
        refused={inputMissing && !hasField(input, start.field)}
        onChange={(text) => onChange(withStartValue(input, start.field, text))}
      />
      <Disclosure summary={words.advanced} defaultOpen={!onlyStartField(input, start.field)}>
        <div className="px-4 pb-3">
          <InputField input={input} onChange={onChange} />
        </div>
      </Disclosure>
    </>
  );
}

/**
 * The workflow's own start field, such as "Answer a customer's email": written as it is typed.
 * Empty, it says what that means: a field the input lacks while the engine refuses the start for
 * it is an error; one that holds empty text starts a run with nothing to work on.
 */
function StartField({
  name,
  start,
  value,
  refused,
  onChange,
}: {
  readonly name: string;
  readonly start: RoutineStartField;
  readonly value: string;
  /** Whether the input lacks this field and the engine refuses the start for it. */
  readonly refused: boolean;
  readonly onChange: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();
  const text = draft ?? value;
  const empty = text.trim() === "";
  return (
    <Field
      label={start.label}
      hint={empty && !refused ? words.startEmpty(name) : undefined}
      error={empty && refused ? words.startMissing(name) : null}
    >
      <TextArea
        value={text}
        minRows={3}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={() => setDraft(undefined)}
      />
    </Field>
  );
}

/** The workflow's input: written once it is a JSON object; text that isn't says so when the field is left. */
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
  const valid = isJsonObject(text);
  const change = (next: string) => {
    setDraft(next);
    setLeft(false);
    if (isJsonObject(next)) onChange(next.trim());
  };
  return (
    <Field
      label={words.input}
      hint={words.inputHint}
      error={left && !valid ? words.notObject : null}
    >
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
  name,
  prompt,
  onChange,
}: {
  readonly name: string;
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
    <Field label={words.prompt} error={text.trim() === "" ? words.promptNeeded(name) : null}>
      <TextArea
        value={text}
        placeholder={words.promptPlaceholder}
        minRows={3}
        onChange={(event) => change(event.target.value)}
        onBlur={() => setDraft(undefined)}
      />
    </Field>
  );
}

/** Whether the text is a JSON object, the only shape a workflow accepts as its input. */
function isJsonObject(text: string): boolean {
  return jsonObject(text) !== undefined;
}

/** The text as a JSON object; `undefined` for text that is anything else. */
function jsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** What the start field holds: `""` while the input lacks it, `undefined` when it isn't text. */
function startValue(input: string, field: string): string | undefined {
  const object = jsonObject(input) ?? {};
  const value = Object.hasOwn(object, field) ? object[field] : "";
  return typeof value === "string" ? value : undefined;
}

/**
 * Whether the workflow's start field shows the missing-input error while the engine refuses the
 * start: it does whenever the workflow has a `start:` block and the input lacks that field.
 */
function startFieldShowsMissing(
  target: RoutineTarget,
  start: RoutineStartField | undefined,
): boolean {
  return target.kind === "workflow" && start !== undefined && !hasField(target.input, start.field);
}

/** Whether the input holds the field at all, even as empty text. */
function hasField(input: string, field: string): boolean {
  return Object.hasOwn(jsonObject(input) ?? {}, field);
}

/** The input with the start field set to `text`, keeping everything else it holds. */
function withStartValue(input: string, field: string, text: string): string {
  return JSON.stringify({ ...jsonObject(input), [field]: text });
}

/** Whether the start field is all the input holds, so Advanced has nothing more to show. */
function onlyStartField(input: string, field: string): boolean {
  return Object.keys(jsonObject(input) ?? {}).every((key) => key === field);
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

/** The placeholders the text may use: every run has the time and the last run; mail adds its message. */
function placeholdersFor(trigger: RoutineTrigger): readonly string[] {
  const names = ["trigger.at", "trigger.lastRun"];
  if (trigger.kind === "mail") names.push("trigger.message");
  return names;
}
