import { Button, Dialog, Field, Input, Select, usePresentation } from "@halonicjs/studio-kit";
import { errorReasonFor, NameAndHubRow, NewItemNote } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import type { NewRoutine, RoutineHub, RoutineRef, RoutineTargetChoice } from "../api.ts";
import { newRoutineWords as words } from "./new-routine-words.ts";
import { PromptField } from "./prompt-field.tsx";
import { routineFilePath } from "./routine-file.ts";

/** The props of {@link NewRoutineDialog}. */
export interface NewRoutineDialogProps {
  readonly hubs: readonly RoutineHub[];
  /** The ids already used in each hub, so the file line can show the `-2` name. */
  readonly takenIds: (hubId: string) => readonly string[];
  /** What a routine made in the hub would run; `undefined` when the hub has nothing to run. */
  readonly starterTarget: (hubId: string) => Promise<RoutineTargetChoice | undefined>;
  /** Makes the routine; rejects with the reason it couldn't be written. */
  readonly create: (newRoutine: NewRoutine) => Promise<RoutineRef>;
  /** After the routine is written: the caller opens it in its tab. */
  readonly onCreated: (ref: RoutineRef) => void;
  readonly onCancel: () => void;
  /**
   * Closes the dialog and opens the New workflow dialog, for a hub with nothing to run. Absent
   * where the app can't open it, so the link isn't shown (no dead controls).
   */
  readonly onNewWorkflow?: (() => void) | undefined;
  readonly returnFocus: () => HTMLElement | null;
}

/** What the dialog knows about the hub it shows: still reading, or what a routine there would run. */
type Starter =
  | { readonly hubId: string; readonly kind: "reading" }
  | { readonly hubId: string; readonly kind: "read"; readonly target?: RoutineTargetChoice };

/**
 * What a routine made in `hubId` would run: `undefined` while it is being read, `null` for a hub
 * with nothing to run. A read that fails stays `undefined`, so Create is what says why the routine
 * can't be made. The caller may pass a new function each render; the read follows the hub only.
 */
function useStarterTarget(
  hubId: string,
  starterTarget: NewRoutineDialogProps["starterTarget"],
): RoutineTargetChoice | null | undefined {
  const [starter, setStarter] = useState<Starter>({ hubId, kind: "reading" });
  const readStarter = useRef(starterTarget);
  readStarter.current = starterTarget;
  useEffect(() => {
    let current = true;
    setStarter({ hubId, kind: "reading" });
    readStarter.current(hubId).then(
      (target) => current && setStarter({ hubId, kind: "read", ...(target ? { target } : {}) }),
      () => current && setStarter({ hubId, kind: "reading" }),
    );
    return () => {
      current = false;
    };
  }, [hubId]);
  if (starter.hubId !== hubId || starter.kind === "reading") return undefined;
  return starter.target ?? null;
}

/**
 * "New routine" (`routines.new.create`): a name, a hub when there is more than one, the file the
 * routine will be written to and the line saying what it will run. When it runs an agent, the
 * dialog asks for the agent's prompt too, since that is the agent's real task. **Create** stays
 * pressable while the name or the prompt is empty and says what is wrong under the field. A hub
 * with no workflow and no agent has nothing to run, so the dialog says so, with **New workflow**,
 * instead of a Create button.
 *
 * @example
 * <NewRoutineDialog hubs={hubs} takenIds={ids} starterTarget={host.starterTarget} create={host.create} onCreated={open} onCancel={close} />
 */
export function NewRoutineDialog({
  hubs,
  takenIds,
  starterTarget,
  create,
  onCreated,
  onCancel,
  onNewWorkflow,
  returnFocus,
}: NewRoutineDialogProps) {
  const [name, setName] = useState("");
  const [chosenHub, setHubId] = useState(hubs[0]?.id ?? "");
  // The hubs can arrive or change while the dialog is open; a hub that's gone falls back to the first.
  const hubId = hubs.some((hub) => hub.id === chosenHub) ? chosenHub : (hubs[0]?.id ?? "");
  const phone = usePresentation() === "phone";
  const [problem, setProblem] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [promptMissing, setPromptMissing] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const target = useStarterTarget(hubId, starterTarget);
  const agent = target?.kind === "agent" ? target : undefined;

  const file = routineFilePath(hubId, name, takenIds(hubId));
  const fileText = file.kind === "file" ? words.file(file.path) : words.folder(file.path);
  // The phone sheet has no room for the file line (microcopy 8.2).
  const fileLine = phone ? undefined : fileText;

  async function submit() {
    setFailure(undefined);
    if (name.trim() === "") {
      setProblem(words.nameMissing);
      nameField.current?.focus();
      return;
    }
    if (agent !== undefined && prompt.trim() === "") {
      setPromptMissing(true);
      promptField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      onCreated(
        await create({
          name: name.trim(),
          hubId,
          ...(agent === undefined ? {} : { prompt: prompt.trim() }),
        }),
      );
    } catch (error) {
      const reason = errorReasonFor(error);
      setFailure(words.createFailed(reason.replace(/\.$/, "")));
      setBusy(false);
    }
  }

  const fields = (
    <div className="flex flex-col gap-3">
      <NameAndHubRow
        name={
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
        }
        hub={
          hubs.length > 1 ? (
            <Field label={words.hubField}>
              <Select
                options={hubs.map((hub) => ({ value: hub.id, label: hub.name }))}
                value={hubId}
                onChange={setHubId}
              />
            </Field>
          ) : undefined
        }
      />
      {/*
        The note is the dialog's description, read when it opens; a change of hub changes it, so
        this region, mounted from the start, reads the new line (WCAG 4.1.3, HAL-14647). While it
        is empty, its negative margin takes back the gap the column gives it; it isn't hidden,
        since a screen reader may not follow a live region that was.
      */}
      <div aria-live="polite" className="empty:-mt-3">
        {target && (
          <NewItemNote id={noteId}>
            {/* The engine can't run an agent from a routine yet (C52 claim 1.6), so that line says so. */}
            {target.kind === "agent" ? words.agentCantRun(target.name) : words.runs(target.name)}
          </NewItemNote>
        )}
      </div>
      {agent && (
        <PromptField
          ref={promptField}
          agentName={agent.name}
          prompt={prompt}
          missing={promptMissing}
          busy={busy}
          onChange={(next) => {
            setPromptMissing(false);
            setPrompt(next);
          }}
        />
      )}
    </div>
  );

  // With nothing to run there is no Create and no form; the ✕ and Escape close the dialog.
  if (target === null) {
    return (
      <Dialog title={words.title} size="md" onCancel={onCancel} returnFocus={returnFocus}>
        {fields}
        <NothingToRun onNewWorkflow={onNewWorkflow} />
      </Dialog>
    );
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
      // The info line says what the routine runs, so a screen reader reads it on opening (UX 2.1).
      {...(target === undefined ? {} : { describedBy: noteId })}
    >
      {fields}
    </Dialog>
  );
}

/** The line for a hub with no workflow and no agent, with **New workflow** when the app can open it. */
function NothingToRun({ onNewWorkflow }: { readonly onNewWorkflow: (() => void) | undefined }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-small text-fg-muted">{words.nothingToRun}</p>
      {onNewWorkflow && (
        <div>
          <Button variant="ghost" size="sm" onClick={onNewWorkflow}>
            {words.newWorkflow}
          </Button>
        </div>
      )}
    </div>
  );
}
