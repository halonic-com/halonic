import type { RemoteControl, RemoteState, TunnelStatus } from "@halonicjs/ports";
import {
  Callout,
  type CalloutAction,
  StatusChip,
  type StatusChipTone,
  Switch,
  useOpenExternal,
} from "@halonicjs/studio-kit";
import type { SettingsSectionProps, SettingsSurface } from "@halonicjs/studio-shell";
import { type ReactNode, useRef, useState } from "react";
import { RemoteControlService } from "../api.ts";
import { PairDialog } from "../pairing/pair-dialog.tsx";
import { useRemoteState } from "../remote-state.ts";
import { providerName, tunnelProblem, tunnelState } from "../tunnel-words.ts";
import { PhoneList } from "./phone-list.tsx";
import * as text from "./remote-text.ts";

/** Settings › Remote as the settings container shows it, over the host's {@link RemoteControl}. */
export function RemoteSection({ context, surface }: SettingsSectionProps) {
  const remote = context.services.find(RemoteControlService);
  const state = useRemoteState(remote);
  if (remote === undefined || state === undefined) return null;
  return (
    <RemoteSettingsView
      remote={remote}
      state={state}
      announce={(line) => context.announcer.announce(line)}
      surface={surface}
    />
  );
}

/** The props of {@link RemoteSettingsView}. */
export interface RemoteSettingsViewProps {
  readonly remote: RemoteControl;
  readonly state: RemoteState;
  /** Says a result in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  /** Where the section shows, for its headings' level. Default the dialog. */
  readonly surface?: SettingsSurface | undefined;
}

/** The section over one snapshot: the tunnel's problem, the switches, and the phones. */
export function RemoteSettingsView({ remote, state, announce, surface }: RemoteSettingsViewProps) {
  const [failed, setFailed] = useState<string>();
  const [pairing, setPairing] = useState(false);
  const openExternal = useOpenExternal();
  const run = (action: Promise<void>, failure: string): Promise<void> => {
    setFailed(undefined);
    return action.catch(() => {
      setFailed(failure);
      announce(failure);
    });
  };
  // A switch ignores a change while its own host call is out, so a quick second click doesn't
  // send a second call. A ref, not state: two clicks can land before React renders again.
  const pending = useRef(new Set<"reach" | "risky">());
  const change = (key: "reach" | "risky", action: () => Promise<void>, failure: string) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    void run(action(), failure).finally(() => pending.current.delete(key));
  };
  const turn = (on: boolean) =>
    change("reach", () => remote.setRemote(on), on ? text.TURN_ON_FAILED : text.TURN_OFF_FAILED);
  // Turning remote off and on again makes the tunnel look again: the port has no other way.
  const checkAgain = () =>
    run(
      remote.setRemote(false).then(() => remote.setRemote(true)),
      text.TURN_ON_FAILED,
    );
  return (
    <div className="flex flex-col gap-6">
      {state.on ? <TunnelProblem state={state} onCheckAgain={checkAgain} /> : null}
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        <Row title={text.REACH_TITLE} line={text.REACH_LINE}>
          <Switch label={text.REACH_TITLE} checked={state.on} onChange={turn} />
        </Row>
        <Row
          title={text.CONNECTION_TITLE}
          line={state.on ? providerName(state.tunnelProviderId) : text.CONNECTION_OFF_LINE}
        >
          <ConnectionChip state={state} />
        </Row>
        <Row title={text.RISKY_TITLE} line={text.RISKY_LINE}>
          <Switch
            label={text.RISKY_TITLE}
            checked={state.allowRiskyRemotely}
            onChange={(allow) =>
              change("risky", () => remote.setAllowRiskyRemotely(allow), text.RISKY_FAILED)
            }
          />
        </Row>
      </div>
      {failed === undefined ? null : <p className="text-small text-danger">{failed}</p>}
      <PhoneList
        remote={remote}
        state={state}
        announce={announce}
        onPair={() => setPairing(true)}
        surface={surface}
      />
      {pairing ? (
        <PairDialog
          remote={remote}
          provider={state.tunnelProviderId}
          allowRisky={state.allowRiskyRemotely}
          openExternal={openExternal}
          onClose={() => setPairing(false)}
        />
      ) : null}
    </div>
  );
}

/** One line of the settings box: its title and line, and its control at the end. */
function Row({
  title,
  line,
  children,
}: {
  readonly title: string;
  readonly line: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-fg">{title}</p>
        <p className="text-small text-fg-muted">{line}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const chipTones: Record<TunnelStatus["state"], StatusChipTone> = {
  ready: "success",
  starting: "neutral",
  degraded: "attention",
  down: "attention",
};

/** The tunnel's state in a word: "Ready", "Starting…", "Signed out", or "Off" while remote is off. */
function ConnectionChip({ state }: { readonly state: RemoteState }) {
  const tone = state.on ? chipTones[state.tunnel.state] : "outline";
  return (
    <StatusChip tone={tone} dot>
      {state.on ? tunnelState(state.tunnel, state.tunnelProviderId) : "Off"}
    </StatusChip>
  );
}

/** What is wrong with the tunnel and the one thing to do, or nothing while it is fine. */
function TunnelProblem({
  state,
  onCheckAgain,
}: {
  readonly state: RemoteState;
  readonly onCheckAgain: () => Promise<void>;
}) {
  const openExternal = useOpenExternal();
  const problem = tunnelProblem(state.tunnel, state.tunnelProviderId);
  if (problem === undefined) return null;
  const actions = problem.actions.map(
    (action): CalloutAction =>
      action.kind === "open"
        ? { label: action.label, onClick: () => openExternal(action.url), opens: action.opens }
        : { label: action.label, busyLabel: text.CHECKING, onClick: onCheckAgain },
  );
  return (
    <Callout tone="attention" title={problem.title} action={actions}>
      {problem.line}
    </Callout>
  );
}
