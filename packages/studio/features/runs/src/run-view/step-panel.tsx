import type { RunEvent } from "@halonicjs/events";
import { Button, CloseIcon, Disclosure, SidePanel } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useRef } from "react";
import { stepEventsWords } from "../run-words.ts";
import { BlockedSitesPanel } from "./blocked-sites.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { ConnectorNotStartedLine, FailedCallLine } from "./failed-call-line.tsx";
import { noConnectionProven, stepSandboxes } from "./sandbox-model.ts";
import { SandboxOffPanel, SandboxPanel, sayText } from "./sandbox-panel.tsx";
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
  /** On a phone the panel fills the screen over the page, with Back, instead of standing beside it. */
  readonly phone?: boolean;
  /** Whether the run is still going, for the sandbox list's "can" or "could". */
  readonly live?: boolean;
}

/**
 * An entry's events in the side panel (checklist part 1, 1.10): first the
 * sites the step's sandbox refused (sandbox-screens 2.2), then the child
 * runs it started, "Started Verify → Run 7k2m9p" with the link, then its model
 * calls with their model and tokens, then its tool calls, each with its
 * arguments folded and, under one that failed, a quiet "✕ Didn't work"
 * line, and last what its sandbox could do (sandbox-screens 1.3).
 * Opening it moves focus to its title, and closing it moves focus back to
 * the entry (kit `SidePanel`).
 *
 * The Blocked sites and sandbox parts have no desktop action yet: the agent
 * page has no Allowed sites field to open (HAL-12658), and the hint already
 * says where to add a site. The hint says "No connection was made." only
 * where the step's sandbox has proven it ({@link noConnectionProven}).
 */
export function StepPanel({
  entry,
  log,
  workflowName,
  openRun,
  onClose,
  phone = false,
  live = false,
}: StepPanelProps) {
  const { modelCalls, toolCalls, connectorsNotStarted } = useMemo(
    () => stepEvents(log, entry.id),
    [log, entry.id],
  );
  const blocked = useMemo(() => stepBlockedSites(log, entry.id), [log, entry.id]);
  const sandboxes = useMemo(() => stepSandboxes(log, entry.id), [log, entry.id]);
  const proven = useMemo(() => noConnectionProven(log, entry.id), [log, entry.id]);
  const children = stepChildRuns(log, entry.id, workflowName);
  const place = phone ? "phone" : "desktop";
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
    <div
      ref={frame}
      className={
        phone ? "fixed inset-0 z-40 bg-surface" : "sticky top-0 w-panel shrink-0 self-start"
      }
    >
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
              noConnectionProven={proven}
              place={place}
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
        {modelCalls.length === 0 &&
        toolCalls.length === 0 &&
        connectorsNotStarted.length === 0 &&
        children.length === 0 &&
        sandboxes.length === 0 ? (
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
        {toolCalls.length === 0 && connectorsNotStarted.length === 0 ? null : (
          <section className="flex flex-col gap-1">
            <h3 className="text-body-strong">{stepEventsWords.toolCalls}</h3>
            {connectorsNotStarted.map((notStarted) => (
              <ConnectorNotStartedLine key={notStarted.id} notStarted={notStarted} />
            ))}
            <ul className="-mx-4 divide-y divide-border">
              {toolCalls.map((call) => (
                <li key={call.id}>
                  <Disclosure summary={call.tool} tone="value">
                    <pre className="px-4 pb-3 font-mono text-small whitespace-pre-wrap wrap-anywhere text-fg-muted">
                      {call.args}
                    </pre>
                  </Disclosure>
                  {call.failed === undefined ? null : (
                    <FailedCallLine tool={call.tool} failed={call.failed} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {sandboxes.map((sandbox, index) => (
          <div key={index} className="pt-4">
            <SandboxItem sandbox={sandbox} live={live} place={place} />
          </div>
        ))}
      </SidePanel>
    </div>
  );
}

/** One sandbox event of the step: its list, the Full access note, or that it couldn't be read. */
function SandboxItem({
  sandbox,
  live,
  place,
}: {
  readonly sandbox: ReturnType<typeof stepSandboxes>[number];
  readonly live: boolean;
  readonly place: "desktop" | "phone";
}) {
  if (sandbox.kind === "unreadable") {
    return <p className="text-body text-fg-muted">{sayText("sandbox.line.unreadable")}</p>;
  }
  if (sandbox.kind === "off") {
    return <SandboxOffPanel agent={sandbox.agent} place={place} />;
  }
  return <SandboxPanel view={sandbox.view} agent={sandbox.agent} live={live} place={place} />;
}
