import { Button, Disclosure, ListHeading } from "@halonicjs/studio-kit";
import { useCallback, useId, useSyncExternalStore } from "react";
import type { ListedToolsReviewModel, ReviewOutcome } from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { ListedToolRowView } from "./listed-tool-row.tsx";
import { PlainList } from "./plain-list.tsx";

/** Props for {@link ListedToolsReviewBody}. */
export interface ListedToolsReviewBodyProps {
  readonly model: ListedToolsReviewModel;
  /** Called with the toast once an approval is removed. The dialog shows it when it closes, since toasts don't show over a dialog. */
  readonly onRemoved: (toast: string) => void;
  /** Called with what a tool's own **Turn it on anyway** did: close with the toast, or stay. */
  readonly onOutcome: (outcome: ReviewOutcome) => void;
}

/** A refused tool's reason, cut for the screen. The full text stays in the tooltip. */
function cutReason(reason: string): string {
  const limit = listedToolsWords.refusedReasonLimit;
  const characters = Array.from(reason);
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : reason;
}

/**
 * The groups of one connector's review, in their order: the tools to decide on (Changed first,
 * then Not approved), Keeps changing, Refused, then Approved folded. The dialog around it owns
 * the title, the top line and the button bar. It reads the model with `useSyncExternalStore`.
 */
export function ListedToolsReviewBody({ model, onRemoved, onOutcome }: ListedToolsReviewBodyProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const { snapshot } = state;
  const keepsChangingId = useId();
  const refusedId = useId();
  if (snapshot === undefined) return null;
  const shown = model.shown;
  const remove = async (name: string) => {
    const toast = await model.removeApproval(name);
    if (toast !== undefined) onRemoved(toast);
  };
  return (
    <div className="flex min-w-0 flex-col">
      {shown.toReview.length === 0 ? null : (
        <PlainList>
          {shown.toReview.map((row) => (
            <ListedToolRowView
              key={row.name}
              row={row}
              sourceName={snapshot.sourceName}
              workspaceName={snapshot.workspaceName}
              showState={snapshot.hasApprovals}
              tick={{ ticked: state.ticked.has(row.name), onToggle: () => model.toggle(row.name) }}
            />
          ))}
        </PlainList>
      )}
      {shown.keepsChanging.length === 0 ? null : (
        <section aria-labelledby={keepsChangingId}>
          <ListHeading
            id={keepsChangingId}
            headingLevel={2}
            name={listedToolsWords.keepsChangingHeading}
          />
          {shown.keepsChanging.map((row, index) => (
            <p
              key={`${index}:${row.name}`}
              className="px-4 text-small text-fg-muted [overflow-wrap:anywhere]"
            >
              {listedToolsWords.keepsChangingLine(row.name)}
            </p>
          ))}
          <PlainList>
            {shown.keepsChanging.map((row, index) => (
              <ListedToolRowView
                key={`${index}:${row.name}`}
                row={row}
                sourceName={snapshot.sourceName}
                workspaceName={snapshot.workspaceName}
                tick={null}
                showState={false}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    busy={state.busy}
                    onClick={() => void model.approveThisVersion(row.name).then(onOutcome)}
                  >
                    {listedToolsWords.turnOnAnyway}
                    <span className="sr-only">: {row.name}</span>
                  </Button>
                }
              />
            ))}
          </PlainList>
        </section>
      )}
      {shown.refused.length === 0 ? null : (
        <section aria-labelledby={refusedId}>
          <ListHeading id={refusedId} headingLevel={2} name={listedToolsWords.refusedHeading} />
          <p className="px-4 pb-1 text-small text-fg-muted">{listedToolsWords.refusedLine}</p>
          <PlainList>
            {shown.refused.map((row) => (
              <li
                key={row.name}
                title={`${row.name}: ${row.reason}`}
                className="px-4 py-2 text-body [overflow-wrap:anywhere]"
              >
                <span className="font-mono">{row.name}</span>
                {`: ${cutReason(row.reason)}`}
              </li>
            ))}
          </PlainList>
        </section>
      )}
      {snapshot.approved.length === 0 ? null : (
        <Disclosure summary={listedToolsWords.approvedHeading(snapshot.approved.length)}>
          <PlainList className="flex flex-col gap-2">
            {snapshot.approved.map((name) => (
              <li key={name} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-mono text-body text-fg [overflow-wrap:anywhere]">
                    {name}
                  </span>
                  <span className="block">{listedToolsWords.approvedAsks}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  busy={state.busy}
                  onClick={() => void remove(name)}
                >
                  {listedToolsWords.removeApproval}
                  <span className="sr-only"> for {name}</span>
                </Button>
              </li>
            ))}
          </PlainList>
        </Disclosure>
      )}
    </div>
  );
}
