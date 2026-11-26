import { Button, UpdateReadyIcon } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { useState } from "react";
import { type AgentSandboxHost, AgentSandboxService, UpdaterService } from "../api.ts";
import { RestartFlowService } from "./restart-flow.ts";
import { UpdateDialog } from "./update-dialog.tsx";
import { notesFor, offeredUpdate } from "./update-dialog-state.ts";
import * as text from "./update-dialog-text.ts";
import type { UpdaterHost } from "./updater-host.ts";
import { useUpdateStatus } from "./use-update-status.ts";

/**
 * **Update** at the title bar's right end (`settings.update-button`): only while a newer version
 * is found, downloading or ready, and never when another tool manages updates. A press opens the
 * Update available dialog. Without an updater, as in served Studio, it draws nothing.
 */
export function UpdateButton({ context }: StatusBarItemProps) {
  const host = context.services.find(UpdaterService);
  const flow = context.services.find(RestartFlowService);
  if (host === undefined || flow === undefined) return null;
  return (
    <UpdateButtonView
      host={host}
      sandbox={context.services.find(AgentSandboxService)}
      announce={(line) => context.announcer.announce(line)}
      onRestart={() => flow.request()}
    />
  );
}

/** The props of {@link UpdateButtonView}. */
export interface UpdateButtonViewProps {
  readonly host: UpdaterHost;
  readonly sandbox?: AgentSandboxHost | undefined;
  readonly announce: (line: string) => void;
  readonly onRestart: () => void;
}

/** The button and its dialog over one updater. */
export function UpdateButtonView({ host, sandbox, announce, onRestart }: UpdateButtonViewProps) {
  const status = useUpdateStatus(host);
  const [open, setOpen] = useState(false);
  const state = offeredUpdate(status);
  if (state === null) {
    // Nothing newer any more (another track picked): a later offer mustn't reopen the dialog.
    if (open) setOpen(false);
    return null;
  }
  // Seen here, where every state arrives, so the dialog still has the notes while downloading.
  notesFor(host, state);
  return (
    <>
      {/* Ghost, but in colour: muted it read like the window title beside it (HAL-19579). */}
      <Button variant="ghost" size="sm" icon={<ReadyIcon />} onClick={() => setOpen(true)}>
        <span aria-hidden="true" className="text-fg">
          {text.UPDATE}
        </span>
        <span className="sr-only">{text.buttonName(state.version)}</span>
      </Button>
      {open ? (
        <UpdateDialog
          host={host}
          sandbox={sandbox}
          announce={announce}
          onRestart={onRestart}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** The update-ready mark in the primary colour, filling the button's icon slot. */
function ReadyIcon() {
  return (
    <span className="block text-primary *:size-full">
      <UpdateReadyIcon />
    </span>
  );
}
