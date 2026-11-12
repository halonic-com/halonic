import type { RunEvent } from "@halonicjs/events";
import { Button, CloseIcon, Disclosure, SidePanel } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useRef } from "react";
import { stepEventsWords } from "../run-words.ts";
import { BlockedSitesPanel } from "./blocked-sites.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { stepBlockedSites, stepChildRuns, stepEvents } from "./step-events-model.ts";

/** Props for {@link StepPanel}. */
export interface StepPanelProps {
  readonly entry: StepEntry;
  readonly log: readonly RunEvent[];
  /** What a child run ran, by its workflow id: "Verify". */
  readonly workflowName: (workflowId: string) => string;
  /** Opens a child run's page; without it the child run is named but not a link. */
  readonly openRun: ((runId: string) => void) | undefined;
  /** ✕, Escape, and Back on a phone. Focus goes back to the entry. */
  readonly onClose: () => void;
}

/**
 * An entry's events in the side panel (checklist part 1, 1.10): first the
 * sites the step's sandbox refused (sandbox-screens 2.2), then the child
 * runs it started, "Started Verify → Run 7k2m9p" with the link, then its model
 * calls with their model and tokens, then its tool calls, each with its
 * arguments folded. Opening it moves focus to its title, and closing it
 * moves focus back to the entry (kit `SidePanel`).
 *
 * The Blocked sites part has no action yet: the Studio has no agent page to
 * open at its allowed sites, and the hint already says where to add a site.
 * It doesn't say "No connection was made." either, because the page can't
 * tell yet whether the run's sandbox has proven that (HAL-6219).
 *
 * Not here yet: what the step could do (HAL-1707).
 */
export function StepPanel({ entry, log, workflowName, openRun, onClose }: StepPanelProps) {
  const { modelCalls, toolCalls } = useMemo(() => stepEvents(log, entry.id), [log, entry.id]);
  const blocked = useMemo(() => stepBlockedSites(log, entry.id), [log, entry.id]);
  const children = stepChildRuns(log, entry.id, workflowName);
  const frame = useRef<HTMLDivElement>(null);
  // Escape while focus is in the panel; the shell's close stack isn't open to features.
  useEffect(() => {
    const element = frame.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    element?.addEventListener("keydown", onKeyDown);
    return () => element?.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div ref={frame} className="sticky top-0 w-panel shrink-0 self-start">
      <SidePanel
        title={entry.name}
        onClose={onClose}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={stepEventsWords.close(entry.name)}
            onClick={onClose}
          />
        }
      >
        {blocked.map(({ sites, agent }) => (
          <div key={sites.firstSeq} className="pb-4">
            <BlockedSitesPanel
              step={sites}
              agent={agent}
              noConnectionProven={false}
              place="desktop"
            />
          </div>
        ))}
        {children.length === 0 ? null : (
          <ul className="flex flex-col gap-1 pb-4">
            {children.map((child) => (
              <li key={child.runId} className="flex flex-wrap items-center gap-x-1.5 text-body">
                <span>{child.started}</span>
                <span aria-hidden="true">→</span>
                {openRun === undefined ? (
                  <span>{child.link}</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => openRun(child.runId)}>
                    {child.link}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {modelCalls.length === 0 && toolCalls.length === 0 && children.length === 0 ? (
          <p className="text-body text-fg-muted">{stepEventsWords.none}</p>
        ) : null}
        {modelCalls.length === 0 ? null : (
          <section className="flex flex-col gap-1 pb-4">
            <h3 className="text-body-strong">{stepEventsWords.modelCalls}</h3>
            <ul className="divide-y divide-border">
              {modelCalls.map((call) => (
                <li key={call.id} className="flex justify-between gap-4 py-1.5 text-body">
                  <span className="min-w-0 wrap-anywhere">{call.model}</span>
                  <span className="shrink-0 whitespace-nowrap text-fg-muted tabular-nums">
                    {call.tokens}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {toolCalls.length === 0 ? null : (
          <section className="flex flex-col gap-1">
            <h3 className="text-body-strong">{stepEventsWords.toolCalls}</h3>
            <ul className="-mx-4 divide-y divide-border">
              {toolCalls.map((call) => (
                <li key={call.id}>
                  <Disclosure summary={call.tool} tone="value">
                    <pre className="px-4 pb-3 font-mono text-small whitespace-pre-wrap wrap-anywhere text-fg-muted">
                      {call.args}
                    </pre>
                  </Disclosure>
                </li>
              ))}
            </ul>
          </section>
        )}
      </SidePanel>
    </div>
  );
}
