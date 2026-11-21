import { type HostSettings, type SandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import { useSandboxStart } from "@halonicjs/studio-feature-runs/api";
import {
  Button,
  Callout,
  Dialog,
  ExternalLink,
  RefreshIcon,
  StatusChip,
  type StatusChipTone,
} from "@halonicjs/studio-kit";
import {
  copyDetailsWords,
  type SettingsSectionProps,
  useCopyDetails,
} from "@halonicjs/studio-shell";
import { type ReactNode, useState } from "react";
import {
  type AgentSandboxHost,
  AgentSandboxService,
  HostSettingsService,
  type UnfencedYesHost,
  UnfencedYesService,
} from "../api.ts";
import { NewAgentsRunControl } from "./new-agents-run.tsx";
import { NotAvailableLines } from "./not-available-lines.tsx";
import {
  type SandboxFacts,
  type SandboxStep,
  type SandboxView,
  sandboxView,
} from "./sandbox-state.ts";
import * as text from "./sandbox-text.ts";
import { UnfencedYesBlock } from "./unfenced-yes.tsx";
import { useAgentSandbox } from "./use-agent-sandbox.ts";
import { WslRemoveDialog } from "./wsl-remove-dialog.tsx";

/** Settings › Agent sandbox as the settings container shows it. Without a host it reads Not available. */
export function AgentSandboxSection({ context, place, surface }: SettingsSectionProps) {
  const host = hostOf(context);
  return (
    <AgentSandboxHostView
      host={host}
      place={place}
      surface={surface}
      unfencedYes={context.services.find(UnfencedYesService)}
      settings={context.services.get(HostSettingsService)}
      announce={(line) => context.announcer.announce(line)}
      startCheck={context.services.find(sandboxStartCheckKey)}
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
  /**
   * The sandbox's start check, which says why it can't start while the section reads Not available;
   * without it the section has 13.1's one line there.
   */
  readonly startCheck?: SandboxStartCheck | undefined;
  /**
   * The window's yes to run plugin and integration code without the sandbox (R16); without it
   * (served Studio, the demo) the section has no "Plugins and integrations".
   */
  readonly unfencedYes?: UnfencedYesHost | undefined;
  readonly surface?: SettingsSectionProps["surface"] | undefined;
}

/** The section over a host: its state, its buttons and the Remove dialog. */
export function AgentSandboxHostView({
  host,
  place,
  settings,
  announce,
  startCheck,
  unfencedYes,
  surface,
}: AgentSandboxHostViewProps) {
  const sandbox = useAgentSandbox(host, place, announce);
  const start = useSandboxStart(startCheck, !sandbox.facts.available);
  const [removing, setRemoving] = useState(false);
  const [removingWsl, setRemovingWsl] = useState(false);
  const [reloading, setReloading] = useState(false);
  const tryLoadAgain = () => {
    if (!settings) return;
    setReloading(true);
    settings.load().then(
      () => setReloading(false),
      () => setReloading(false),
    );
  };
  let newAgents: ReactNode = null;
  if (settings?.loaded) {
    newAgents = (
      <div className="max-w-90">
        <NewAgentsRunControl settings={settings} viewOnly={place === "served"} />
      </div>
    );
  } else if (settings) {
    newAgents = (
      <div className="flex max-w-90 flex-col items-start gap-2">
        <p className="text-small text-fg-muted">{text.NEW_AGENTS_NOT_LOADED}</p>
        <Button variant="ghost" size="sm" busy={reloading} onClick={tryLoadAgain}>
          {text.TRY_AGAIN}
        </Button>
      </div>
    );
  }
  const wslRemoval =
    host?.removeWslSetup && place === "app" ? (
      <div className="flex max-w-90 flex-col items-start gap-2">
        <p className="text-small text-fg-muted">{text.WSL_REMOVE_LINE}</p>
        <Button variant="ghost" size="sm" onClick={() => setRemovingWsl(true)}>
          {text.WSL_REMOVE_BUTTON}
        </Button>
      </div>
    ) : null;
  return (
    <>
      <AgentSandboxView
        facts={sandbox.facts}
        onSetUp={sandbox.setUp}
        onRemove={() => setRemoving(true)}
        onCheckAgain={sandbox.checkAgain}
        notAvailable={<NotAvailableLines start={start} announce={announce} />}
        newAgents={
          <>
            {wslRemoval}
            {newAgents}
            {unfencedYes ? (
              <UnfencedYesBlock host={unfencedYes} surface={surface} announce={announce} />
            ) : null}
          </>
        }
      />
      {removingWsl && host ? (
        <WslRemoveDialog
          host={host}
          announce={announce}
          onClose={(removed) => {
            setRemovingWsl(false);
            if (removed) sandbox.checkAgain();
          }}
        />
      ) : null}
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
  /** What follows the Not available chip in place of 13.1's one line, when the section can say why. */
  readonly notAvailable?: ReactNode;
}

const chipTones: Record<NonNullable<SandboxView["chip"]>["tone"], StatusChipTone> = {
  attention: "attention",
  neutral: "neutral",
  success: "success",
  warning: "warning",
};

const marks: Record<SandboxStep["mark"], string> = { done: "✓", doing: "◌", waiting: "○" };

/** A note (an earlier setup still running) reads in the info tone; a failure as a warning. */
function calloutTone(callout: NonNullable<SandboxView["callout"]>): "info" | "warning" {
  return callout.note ? "info" : "warning";
}

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
  notAvailable,
}: AgentSandboxViewProps) {
  const copyDetails = useCopyDetails();
  const view = sandboxView(facts, new Date());
  const copy = () => void copyDetails(view.details ?? "");
  const buttons = {
    "check-again": { label: text.CHECK_AGAIN, onClick: onCheckAgain },
    remove: { label: text.REMOVE, onClick: onRemove },
    "copy-details": { label: copyDetailsWords.label, onClick: copy },
  } as const;
  const calloutAction = {
    "try-again": { label: text.TRY_AGAIN, onClick: onSetUp },
    "copy-details": { label: copyDetailsWords.label, onClick: copy },
  } as const;
  return (
    <div className="flex max-w-120 flex-col gap-4">
      {view.chip ? (
        // `self-start`: the column stretches its children, and a chip is as wide as its word.
        <span className="self-start">
          <StatusChip tone={chipTones[view.chip.tone]}>{view.chip.label}</StatusChip>
        </span>
      ) : null}
      <Lead lead={view.lead} notAvailable={facts.available ? undefined : notAvailable} />
      {facts.securityUpdatesOverdue && facts.available ? (
        <Callout tone="warning">{text.SECURITY_UPDATES_OVERDUE}</Callout>
      ) : null}
      {/* The default distro first: Docker Desktop connects to the default by itself (HAL-12513). */}
      {facts.defaultDistro && facts.available ? (
        <Callout tone="warning">{text.DEFAULT_DISTRO}</Callout>
      ) : null}
      {facts.check.state === "ready" && facts.check.dockerDesktopVisible && facts.available ? (
        <Callout tone="warning">{text.DOCKER_DESKTOP_VISIBLE}</Callout>
      ) : null}
      {view.callout ? (
        <Callout
          tone={calloutTone(view.callout)}
          {...(view.callout.action ? { action: calloutAction[view.callout.action] } : {})}
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
            size="sm"
            {...(action === "check-again" ? { icon: <RefreshIcon /> } : {})}
            busy={action === "check-again" && view.checkBusy}
            onClick={buttons[action].onClick}
          >
            {buttons[action].label}
          </Button>
        ))}
      </div>
      {view.docs ? (
        <p className="text-small">
          <ExternalLink href={view.docs.href}>{view.docs.name}</ExternalLink>
        </p>
      ) : null}
      {view.hint ? <p className="text-small text-fg-muted">{view.hint}</p> : null}
      {newAgents}
    </div>
  );
}

/** The words under the chip: the Not available lines where the section has them, else the view's lead. */
function Lead({ lead, notAvailable }: { readonly lead: string; readonly notAvailable: ReactNode }) {
  if (notAvailable !== undefined && notAvailable !== null) return notAvailable;
  return lead === "" ? null : <p className="text-small">{lead}</p>;
}

/** The app's sandbox host, or none when the app gives none (served Studio, or a build without it). */
function hostOf(context: SettingsSectionProps["context"]): AgentSandboxHost | undefined {
  return context.services.find(AgentSandboxService);
}
