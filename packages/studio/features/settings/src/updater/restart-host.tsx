import { Dialog, type ToastStore, useOpenExternal, useToastStore } from "@halonicjs/studio-kit";
import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { RestartRunsService, UpdaterService } from "../api.ts";
import { TRY_AGAIN, UPDATER_DIDNT_ANSWER } from "./about-text.ts";
import { releasePage } from "./links.ts";
import { type RestartFlow, RestartFlowService } from "./restart-flow.ts";
import type { RestartRuns } from "./restart-runs.ts";
import * as text from "./restart-text.ts";
import type { UpdaterHost } from "./updater-host.ts";
import type { UpdateStatus } from "./updater-status.ts";
import { useUpdateStatus } from "./use-update-status.ts";

/**
 * Draws the restart flow's dialog and says what the status bar can't (`settings.restart-host`):
 * the "Updated to" and "didn't install" toasts, once per start, and the download's start and end
 * for screen readers. It only reads the updater; a press on a button acts.
 */
export function RestartHost({ context }: DialogHostProps) {
  const host = context.services.find(UpdaterService);
  const flow = context.services.find(RestartFlowService);
  if (host === undefined || flow === undefined) return null;
  return (
    <RestartHostView
      host={host}
      flow={flow}
      runs={context.services.find(RestartRunsService)}
      announce={(line, politeness) => context.announcer.announce(line, politeness)}
    />
  );
}

interface RestartHostViewProps {
  readonly host: UpdaterHost;
  readonly flow: RestartFlow;
  readonly runs: { count(): Promise<RestartRuns> } | undefined;
  readonly announce: (line: string, politeness?: "polite" | "assertive") => void;
}

/** The toasts already shown for each page's updater, so a window that remounts doesn't repeat them. */
const toastsShown = new WeakMap<UpdaterHost, Set<string>>();

function RestartHostView({ host, flow, runs, announce }: RestartHostViewProps) {
  const toasts = useToastStore();
  const openExternal = useOpenExternal();
  const status = useUpdateStatus(host);
  const [asking, setAsking] = useState<{ runs: RestartRuns; version: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const before = useRef<UpdateStatus["state"]["kind"] | null>(null);
  const statusNow = useRef(status);
  statusNow.current = status;

  const restart = async () => {
    try {
      await host.restart();
    } catch {
      setBusy(false);
      toasts?.show({
        tone: "danger",
        title: UPDATER_DIDNT_ANSWER,
        action: { label: TRY_AGAIN, onClick: () => void restart() },
      });
    }
  };

  useEffect(
    () =>
      flow.onRequest(async () => {
        const version = readyVersion(statusNow.current);
        if (version === null) return;
        try {
          const counted = (await runs?.count()) ?? { running: 0, waitingForYou: 0 };
          if (counted.running === 0) await restart();
          else setAsking({ runs: counted, version });
        } catch {
          toasts?.show({
            tone: "danger",
            title: UPDATER_DIDNT_ANSWER,
            action: { label: TRY_AGAIN, onClick: () => void restart() },
          });
        }
      }),
    [flow, runs],
  );

  useEffect(() => {
    if (status === null) return;
    flow.report(status);
    const { state } = status;
    if (before.current !== null && before.current !== state.kind) {
      if (state.kind === "downloading") announce(text.announceDownloading(state.version));
      if (state.kind === "ready" && before.current === "downloading") {
        announce(text.announceReady(state.version));
      }
    }
    before.current = state.kind;
    if (toasts !== null) showStartToasts(host, status, toasts, openExternal);
    // Each status is handled once; the callbacks it reads are the page's own.
  }, [status]);

  if (asking === null) return null;
  return (
    <Dialog
      title={text.DIALOG_TITLE}
      size="sm"
      busy={busy}
      confirm={{
        label: text.confirmLabel(asking.runs.running),
        variant: "danger",
        busyLabel: text.DIALOG_BUSY,
      }}
      footnote={text.installsOnQuit(asking.version)}
      onConfirm={() => {
        setBusy(true);
        void restart();
      }}
      onCancel={() => setAsking(null)}
    >
      {text.runsBody(asking.runs)}
    </Dialog>
  );
}

function readyVersion(status: UpdateStatus | null): string | null {
  return status !== null && status.state.kind === "ready" && status.managed === null
    ? status.state.version
    : null;
}

/** The two toasts a start can show, each once for this page: after an update and when it didn't install. */
function showStartToasts(
  host: UpdaterHost,
  status: UpdateStatus,
  toasts: ToastStore,
  openExternal: (address: string) => Promise<void>,
): void {
  const shown = toastsShown.get(host) ?? new Set<string>();
  toastsShown.set(host, shown);
  const once = (key: string) => !shown.has(key) && Boolean(shown.add(key));
  const { justUpdated, state } = status;
  if (justUpdated !== null && once(`updated:${justUpdated.to}`)) {
    toasts.show({
      tone: "info",
      title: text.updatedTo(justUpdated.to),
      action: {
        label: text.WHATS_NEW,
        onClick: () => void openExternal(releasePage(justUpdated.to)),
      },
    });
  }
  if (state.kind === "did-not-install" && once(`failed:${state.version}:${state.attempts}`)) {
    const again = { label: text.TRY_AGAIN, onClick: () => void host.download() };
    const second = state.attempts >= 2;
    toasts.show({
      tone: "danger",
      title: text.didNotInstall(state.version, status.current),
      ...(second ? { text: text.SECOND_FAILURE } : {}),
      action: second
        ? {
            label: text.OPEN_RELEASE_PAGE,
            onClick: () => void openExternal(releasePage(state.version)),
          }
        : again,
    });
  }
}
