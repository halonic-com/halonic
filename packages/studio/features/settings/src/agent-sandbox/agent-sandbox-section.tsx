import type { HostSettings } from "@halonicjs/app";
import { Button, Callout, Dialog, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { type ReactNode, useState } from "react";
import { type AgentSandboxHost, AgentSandboxService, HostSettingsService } from "../api.ts";
import { NewAgentsRunControl } from "./new-agents-run.tsx";
import {
  type SandboxFacts,
  type SandboxStep,
  type SandboxView,
  sandboxView,
} from "./sandbox-state.ts";
import * as text from "./sandbox-text.ts";
import { useAgentSandbox } from "./use-agent-sandbox.ts";

/** Settings › Agent sandbox as the settings container shows it. Without a host it reads Not available. */
export function AgentSandboxSection({ context, place }: SettingsSectionProps) {
  const host = hostOf(context);
  return (
    <AgentSandboxHostView
      host={host}
      place={place}
      settings={context.services.get(HostSettingsService)}
      announce={(line) => context.announcer.announce(line)}
    />
  );
}

/** The props of {@link AgentSandboxHostView}. */
export interface AgentSandboxHostViewProps {
  readonly host: AgentSandboxHost | undefined;
  readonly place: SandboxFacts["place"];
  /** Where **New agents run** is kept; without it, or before it loads, the control isn't shown. */
  readonly settings?: HostSettings | undefined;
  /** Says a result in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/** The section over a host: its state, its buttons and the Remove dialog. */
export function AgentSandboxHostView({
  host,
  place,
  settings,
  announce,
}: AgentSandboxHostViewProps) {
  const sandbox = useAgentSandbox(host, place, announce);
  const [removing, setRemoving] = useState(false);
  return (
    <>
      <AgentSandboxView
        facts={sandbox.facts}
        onSetUp={sandbox.setUp}
        onRemove={() => setRemoving(true)}
        onCheckAgain={sandbox.checkAgain}
        newAgents={
          settings?.loaded ? (
            <NewAgentsRunControl settings={settings} viewOnly={place === "served"} />
          ) : null
        }
      />
      {removing ? (
        <Dialog
          title={text.REMOVE_TITLE}
          confirm={{ label: text.REMOVE_CONFIRM, variant: "danger", busyLabel: "Removing…" }}
          cancelLabel={text.REMOVE_CANCEL}
          onConfirm={() => {
            setRemoving(false);
            sandbox.remove();
          }}
          onCancel={() => setRemoving(false)}
        >
          <p>{text.REMOVE_BODY}</p>
        </Dialog>
      ) : null}
    </>
  );
}

/** The props of {@link AgentSandboxView}. */
export interface AgentSandboxViewProps {
  readonly facts: SandboxFacts;
  readonly onSetUp: () => void;
  /** Opens the Remove dialog; nothing is removed until it is confirmed. */
  readonly onRemove: () => void;
  readonly onCheckAgain: () => void;
  /** **New agents run**, under the buttons, or nothing when it can't be shown. */
  readonly newAgents?: ReactNode;
}

const chipTones: Record<NonNullable<SandboxView["chip"]>["tone"], StatusChipTone> = {
  attention: "attention",
  neutral: "neutral",
  success: "success",
};

const marks: Record<SandboxStep["mark"], string> = { done: "✓", doing: "◌", waiting: "○" };

/**
 * Settings › Agent sandbox (`settings.agent-sandbox-section`): the chip, the words, the steps while
 * one runs, the failure Callout and the buttons that {@link sandboxView} decides.
 */
export function AgentSandboxView({
  facts,
  onSetUp,
  onRemove,
  onCheckAgain,
  newAgents = null,
}: AgentSandboxViewProps) {
  const view = sandboxView(facts, new Date());
  const buttons = {
    "check-again": { label: text.CHECK_AGAIN, onClick: onCheckAgain },
    remove: { label: text.REMOVE, onClick: onRemove },
  } as const;
  return (
    <div className="mt-5 flex max-w-120 flex-col gap-4">
      <p className="text-body text-fg-muted">{text.FIRST_LINE}</p>
      {view.chip ? (
        <StatusChip tone={chipTones[view.chip.tone]}>{view.chip.label}</StatusChip>
      ) : null}
      {view.lead === "" ? null : <p className="text-small">{view.lead}</p>}
      {view.callout ? (
        <Callout
          tone="warning"
          {...(view.callout.action ? { action: { label: text.TRY_AGAIN, onClick: onSetUp } } : {})}
        >
          {view.callout.line}
        </Callout>
      ) : null}
      {view.steps.length === 0 ? null : (
        <ol className="flex flex-col gap-1 text-small" aria-live="polite">
          {view.steps.map((step) => (
            <li key={step.label}>
              <span aria-hidden="true">{marks[step.mark]} </span>
              {step.label}
              {step.note ? <span className="block text-fg-muted">{step.note}</span> : null}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {view.primary ? (
          <Button variant="secondary" busy={view.primary.busy} onClick={onSetUp}>
            {view.primary.label}
          </Button>
        ) : null}
        {view.secondary.map((action) => (
          <Button
            key={action}
            variant="ghost"
            busy={action === "check-again" && view.checkBusy}
            onClick={buttons[action].onClick}
          >
            {buttons[action].label}
          </Button>
        ))}
      </div>
      {view.hint ? <p className="text-small text-fg-muted">{view.hint}</p> : null}
      {newAgents}
    </div>
  );
}

/** The app's sandbox host, or none when the app gives none (served Studio, or a build without it). */
function hostOf(context: SettingsSectionProps["context"]): AgentSandboxHost | undefined {
  return context.services.find(AgentSandboxService);
}
