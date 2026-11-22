import {
  Button,
  ChevronRightIcon,
  EmptyState,
  StatusChip,
  usePresentation,
} from "@halonicjs/studio-kit";
import { type ItemPageSectionViewProps, SECTION_ADD_STEP } from "@halonicjs/studio-shell";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  type RoutinesHost,
  RoutinesHostService,
  type TriggerOwner,
  type TriggerRow,
  type WorkflowWithAgent,
} from "../api.ts";
import { nextWhen } from "../list/list-words.ts";
import { failureReason } from "../page/page-words.ts";
import { TRIGGER_STEP } from "../page/trigger-step.ts";
import { triggersWords } from "./triggers-words.ts";
import { useTriggerRows } from "./use-trigger-rows.ts";

/** The command that opens New workflow, as the Routines page's empty state runs it. */
const newWorkflowCommand = "workflows.new";

/** The **Triggers** section on an agent's or a workflow's page: the routines that start it. */
export function TriggersSection({ item, context, step }: ItemPageSectionViewProps) {
  const kind = item.kind === "workflow" ? "workflow" : "agent";
  const { openItem, runCommand } = context;
  return (
    <TriggersView
      host={context.services.get(RoutinesHostService)}
      owner={{ kind, hubId: item.hub, id: item.id }}
      startAdding={step === SECTION_ADD_STEP}
      {...(openItem && {
        openRoutine: (hubId: string, id: string, step?: string) =>
          openItem({ kind: "routine", hub: hubId, id }, step === undefined ? {} : { step }),
      })}
      {...(runCommand && { newWorkflow: () => void runCommand(newWorkflowCommand) })}
    />
  );
}

/** Props for {@link TriggersView}. */
export interface TriggersViewProps {
  readonly host: RoutinesHost;
  readonly owner: TriggerOwner;
  /**
   * Opens a routine's page, on `step` when given (see {@link TRIGGER_STEP}); without it the rows
   * aren't buttons.
   */
  readonly openRoutine?: (hubId: string, id: string, step?: string) => void;
  /**
   * Set when the page asks the section to start adding, such as the agent map's **Add trigger**:
   * on a workflow the section then does what its own Add trigger does, once.
   */
  readonly startAdding?: boolean;
  /** Opens New workflow, for an agent that is a step in no workflow; without it there's no button. */
  readonly newWorkflow?: () => void;
}

/**
 * The section's body (`routines.triggers.lists-routines-that-start-it`,
 * `routines.triggers.empty-state`, `routines.triggers.add-trigger-creates-routine`): a row per
 * routine in the owner's hub that starts it, sorted by name, then on a workflow **Add trigger**,
 * which makes a routine and opens it with its Trigger picker focused. Halonic can't run an agent on
 * its own yet, so an agent's section offers no Add trigger: it says so and leads to the workflows
 * the agent is a step in instead (`routines.triggers.agent-cant-run-note`). Opened with
 * `startAdding`, a workflow's section presses its own Add trigger once it is drawn; an agent's
 * shows as it is, since that way in is what adding a trigger to it means for now
 * (`routines.triggers.add-trigger-from-page`).
 */
export function TriggersView({
  host,
  owner,
  openRoutine,
  startAdding = false,
  newWorkflow,
}: TriggersViewProps) {
  const { load, retry } = useTriggerRows(host, owner);
  /** The workflow a trigger is being made for, while the host makes it. */
  const [adding, setAdding] = useState<string>();
  const [addError, setAddError] = useState<string>();

  const addTo = async (workflowId: string) => {
    setAdding(workflowId);
    setAddError(undefined);
    try {
      const ref = await host.addTrigger({ kind: "workflow", hubId: owner.hubId, id: workflowId });
      openRoutine?.(ref.hubId ?? owner.hubId, ref.id, TRIGGER_STEP);
    } catch (error) {
      setAddError(triggersWords.addFailed(failureReason(error)));
    } finally {
      setAdding(undefined);
    }
  };

  // Once per drawn section, so a second run of the effect can't make a workflow's routine twice.
  const startedAdding = useRef(false);
  const addOnStart = useEffectEvent(() => void addTo(owner.id));
  useEffect(() => {
    if (!startAdding || owner.kind !== "workflow" || startedAdding.current) return;
    startedAdding.current = true;
    addOnStart();
  }, [startAdding, owner.kind]);

  // A plain wrapper with no heading or name of its own: the section is a Configuration page, and
  // the page's tab panel already names it "Triggers", like the built pages.
  return (
    <div className="flex flex-col gap-2">
      <Rows load={load} owner={owner} retry={retry} openRoutine={openRoutine} />
      {owner.kind === "workflow" && (
        <div className="flex gap-2">
          <Button variant="secondary" busy={adding === owner.id} onClick={() => addTo(owner.id)}>
            {triggersWords.addTrigger}
          </Button>
        </div>
      )}
      {owner.kind === "agent" && load.kind === "ready" && (
        <AgentWayIn
          workflows={load.workflows}
          adding={adding}
          addTo={addTo}
          newWorkflow={newWorkflow}
        />
      )}
      {addError !== undefined && (
        <p role="alert" className="text-small text-danger">
          {addError}
        </p>
      )}
    </div>
  );
}

/**
 * What an agent's section offers in place of Add trigger: the line saying why, then an Add trigger
 * for each workflow the agent is a step in, or New workflow when there is none.
 */
function AgentWayIn({
  workflows,
  adding,
  addTo,
  newWorkflow,
}: {
  readonly workflows: readonly WorkflowWithAgent[];
  readonly adding: string | undefined;
  readonly addTo: (workflowId: string) => void;
  readonly newWorkflow: (() => void) | undefined;
}) {
  const inWorkflows = workflows.length > 0;
  return (
    <>
      <p className="text-small text-fg-muted">{triggersWords.agentCantRun(inWorkflows)}</p>
      {inWorkflows && (
        <ul className="flex flex-wrap gap-2">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <Button
                variant="secondary"
                busy={adding === workflow.id}
                onClick={() => addTo(workflow.id)}
              >
                {triggersWords.addTriggerTo(workflow.name)}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!inWorkflows && newWorkflow && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={newWorkflow}>
            {triggersWords.newWorkflow}
          </Button>
        </div>
      )}
    </>
  );
}

function Rows({
  load,
  owner,
  retry,
  openRoutine,
}: {
  readonly load: ReturnType<typeof useTriggerRows>["load"];
  readonly owner: TriggerOwner;
  readonly retry: () => void;
  readonly openRoutine: TriggersViewProps["openRoutine"];
}) {
  if (load.kind === "loading") return <p role="status">{triggersWords.loading}</p>;
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={triggersWords.loadFailedTitle}
        description={load.reason}
        action={{ label: triggersWords.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  if (load.rows.length === 0) {
    // On an agent, the line under the rows says why nothing starts it, and what to do.
    return owner.kind === "workflow" ? (
      <p className="text-fg-muted">{triggersWords.empty}</p>
    ) : null;
  }
  const now = new Date();
  return (
    <ul className="flex flex-col">
      {load.rows.map((row) => (
        <li key={`${row.hubId}/${row.id}`}>
          <RowButton row={row} owner={owner} now={now} openRoutine={openRoutine} />
        </li>
      ))}
    </ul>
  );
}

function RowButton({
  row,
  owner,
  now,
  openRoutine,
}: {
  readonly row: TriggerRow;
  readonly owner: TriggerOwner;
  readonly now: Date;
  readonly openRoutine: TriggersViewProps["openRoutine"];
}) {
  const phone = usePresentation() === "phone";
  const next = row.enabled && row.nextRun !== undefined ? nextWhen(row.nextRun, now) : undefined;
  return (
    <button
      type="button"
      className={`flex w-full justify-between gap-2 rounded-sm px-2 text-left hover:bg-surface-muted focus-ring ${
        phone ? "min-h-control-md items-start py-2" : "items-center py-1"
      }`}
      onClick={() => openRoutine?.(row.hubId ?? owner.hubId, row.id)}
    >
      <span className="flex min-w-0 flex-col">
        <span>{row.sentence}</span>
        {row.enabled && (
          <span className="text-small text-fg-muted">
            {triggersWords.nameAndNext(row.name, next)}
          </span>
        )}
        {!row.enabled && <span className="text-small text-fg-muted">{row.name}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {!row.enabled && <StatusChip tone="neutral">{triggersWords.off}</StatusChip>}
        {/* On a phone the Off chip takes the chevron's place (flow-routines 5.5). */}
        {!phone && openRoutine !== undefined && (
          <span className="size-icon-md text-fg-subtle *:size-full" aria-hidden="true">
            <ChevronRightIcon />
          </span>
        )}
      </span>
    </button>
  );
}
