import type { RunEvent } from "@halonicjs/events";
import { Button, CloseIcon, Disclosure, SidePanel } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useRef } from "react";
import { stepEventsWords } from "../run-words.ts";
import type { StepEntry } from "./every-step-model.ts";
import { stepEvents } from "./step-events-model.ts";

/** Props for {@link StepPanel}. */
export interface StepPanelProps {
  readonly entry: StepEntry;
  readonly log: readonly RunEvent[];
  /** ✕, Escape, and Back on a phone. Focus goes back to the entry. */
  readonly onClose: () => void;
}

/**
 * An entry's events in the side panel (checklist part 1, 1.10): the step's
 * model calls with their model and tokens, then its tool calls, each with
 * its arguments folded. Opening it moves focus to its title, and closing it
 * moves focus back to the entry (kit `SidePanel`).
 *
 * Not here yet: the step's blocked sites and what it could do (HAL-1707, HAL-1708).
 */
export function StepPanel({ entry, log, onClose }: StepPanelProps) {
  const { modelCalls, toolCalls } = useMemo(() => stepEvents(log, entry.id), [log, entry.id]);
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
        {modelCalls.length === 0 && toolCalls.length === 0 ? (
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
