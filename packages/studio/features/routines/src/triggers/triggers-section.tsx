import { Button, EmptyState, StatusChip, usePresentation } from "@halonicjs/studio-kit";
import type { ItemPageSectionViewProps } from "@halonicjs/studio-shell";
import { useId, useState } from "react";
import {
  type RoutinesHost,
  RoutinesHostService,
  type TriggerOwner,
  type TriggerRow,
} from "../api.ts";
import { nextWhen } from "../list/list-words.ts";
import { failureReason } from "../page/page-words.ts";
import { TRIGGER_STEP } from "../page/trigger-step.ts";
import { triggersWords } from "./triggers-words.ts";
import { useTriggerRows } from "./use-trigger-rows.ts";

/** The **Triggers** section on an agent's or a workflow's page: the routines that start it. */
export function TriggersSection({ item, context }: ItemPageSectionViewProps) {
  const kind = item.kind === "workflow" ? "workflow" : "agent";
  const { openItem } = context;
  return (
    <TriggersView
      host={context.services.get(RoutinesHostService)}
      owner={{ kind, hubId: item.hub, id: item.id }}
      {...(openItem && {
        openRoutine: (hubId: string, id: string, step?: string) =>
          openItem({ kind: "routine", hub: hubId, id }, step === undefined ? {} : { step }),
      })}
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
}

/**
 * The section's body (`routines.triggers.lists-routines-that-start-it`,
 * `routines.triggers.empty-state`, `routines.triggers.add-trigger-creates-routine`): a row per
 * routine in the owner's hub that starts it, sorted by name, then **Add trigger**, which opens the
 * new routine with its Trigger picker focused.
 */
export function TriggersView({ host, owner, openRoutine }: TriggersViewProps) {
  const { load, retry } = useTriggerRows(host, owner);
  const headingId = useId();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string>();

  const add = async () => {
    setAdding(true);
    setAddError(undefined);
    try {
      const ref = await host.addTrigger(owner);
      openRoutine?.(ref.hubId ?? owner.hubId, ref.id, TRIGGER_STEP);
    } catch (error) {
      setAddError(triggersWords.addFailed(failureReason(error)));
    } finally {
      setAdding(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {triggersWords.heading}
      </h2>
      <Rows load={load} owner={owner} retry={retry} openRoutine={openRoutine} />
      {addError !== undefined && (
        <p role="alert" className="text-small text-danger">
          {addError}
        </p>
      )}
      <div>
        <Button variant="secondary" busy={adding} onClick={add}>
          {triggersWords.addTrigger}
        </Button>
      </div>
    </section>
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
        headingLevel={3}
        title={triggersWords.loadFailedTitle}
        description={load.reason}
        action={{ label: triggersWords.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  if (load.rows.length === 0)
    return <p className="text-fg-muted">{triggersWords.empty(owner.kind)}</p>;
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
      className={`flex w-full justify-between gap-2 text-left ${
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
      {!row.enabled && (
        <span className="shrink-0">
          <StatusChip tone="neutral">{triggersWords.off}</StatusChip>
        </span>
      )}
    </button>
  );
}
