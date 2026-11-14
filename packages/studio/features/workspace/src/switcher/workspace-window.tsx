import {
  type KeyboardPlatform,
  type Shell,
  StudioWindow,
  WelcomeWindow,
  type WindowActions,
} from "@halonicjs/studio-shell";
import { useEffect, useState, useSyncExternalStore } from "react";
import { openWorkspaceCommand } from "../feature.ts";
import {
  NewWorkspaceDialog,
  type NewWorkspaceHost,
} from "../new-workspace/new-workspace-dialog.tsx";
import { createdLine } from "../new-workspace/new-workspace-text.ts";
import { WorkspaceTrustBadge } from "../trust/workspace-trust-badge.tsx";
import { CloseWorkspaceDialog } from "./close-workspace-dialog.tsx";
import { workspaceMenu } from "./workspace-menu.ts";
import { historyKey } from "./workspace-saving.ts";
import type { WorkspaceSwitcher } from "./workspace-switcher.ts";

/** Props for {@link WorkspaceWindow}. */
export interface WorkspaceWindowProps {
  /** The registered features and the window's announcer, close stack, engine and toasts. */
  readonly shell: Shell;
  /** The window's open workspaces and the ways to open and close them. */
  readonly switcher: WorkspaceSwitcher;
  /** Decides Ctrl or ⌘ in the key hints and the keys. */
  readonly platform: KeyboardPlatform;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
  /**
   * What the New workspace dialog needs from the app. Without it the window has no
   * **New workspace…** row or button.
   */
  readonly newWorkspace?: NewWorkspaceHost;
}

/**
 * The desktop app's window: the Welcome screen while no workspace is open, else the shown
 * workspace's Studio window with the workspace switcher at the top of its sidebar. Ctrl 1 to
 * Ctrl 9 (⌘ on macOS) show the open workspace at that position
 * (`workspace.switcher.ctrl-number-keys`).
 *
 * @example
 * <WorkspaceWindow shell={shell} switcher={switcher} platform="windows" language="en" />
 */
export function WorkspaceWindow({
  shell,
  switcher,
  platform,
  language,
  newWorkspace,
}: WorkspaceWindowProps) {
  const { open } = switcher;
  const [creating, setCreating] = useState(false);
  const askNewWorkspace = newWorkspace === undefined ? undefined : () => setCreating(true);
  const shown = useSyncExternalStore(
    (onChange) => open.subscribe(onChange),
    () => open.shown,
  );
  // The menu reads Recent as it draws, so a row removed from a toast goes at once.
  useSyncExternalStore(
    (onChange) => switcher.recent.subscribe(onChange),
    () => switcher.recent.version,
  );
  const busy = useSyncExternalStore(
    (onChange) => switcher.subscribe(onChange),
    () => switcher.busy,
  );
  const closeRequest = useSyncExternalStore(
    (onChange) => switcher.subscribe(onChange),
    () => switcher.closeRequest,
  );
  const retrying = useSyncExternalStore(
    (onChange) => switcher.subscribe(onChange),
    () => switcher.retrying,
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const position = workspaceKeyPosition(event, platform);
      if (position !== undefined) {
        event.preventDefault();
        switcher.showAt(position);
        return;
      }
      const history = historyKey(event, platform);
      const saving = switcher.open.shown?.value.saving;
      // In a text field Ctrl Z is the field's own undo.
      if (history !== undefined && saving !== undefined && !isEditing(event.target)) {
        event.preventDefault();
        if (history === "undo") saving.undo();
        else saving.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [switcher, platform]);

  const dialog =
    creating && newWorkspace !== undefined ? (
      <NewWorkspaceDialog
        host={newWorkspace}
        onCancel={() => setCreating(false)}
        onOpen={(folder) => {
          setCreating(false);
          void switcher.fromMenu(() => switcher.openLocation(folder));
        }}
        onCreated={(folder, name, trust) => {
          setCreating(false);
          const toast = createdLine(name, trust.kind === "not-saved" ? trust.reason : undefined);
          void switcher.fromMenu(() => switcher.openLocation(folder, toast));
        }}
      />
    ) : null;
  if (shown === undefined) {
    return (
      <>
        <WelcomeWindow
          shell={shell}
          language={language}
          onOpenFolder={() => switcher.pickAndOpen()}
          onNewWorkspace={askNewWorkspace}
          recent={{
            workspaces: switcher.recent.list(),
            onOpen: (location) => switcher.openLocation(location),
            onRemove: (location) => switcher.removeFromRecent(location),
          }}
        />
        {dialog}
      </>
    );
  }
  const menu = (window: WindowActions) =>
    workspaceMenu({
      recent: switcher.recent.list(),
      open: open.all.map((slot) => slot.location),
      shown: shown.location,
      platform,
      onOpen: (location) => void switcher.fromMenu(() => switcher.openLocation(location), true),
      ...(askNewWorkspace === undefined ? {} : { onNewWorkspace: askNewWorkspace }),
      onOpenFolder: () => void switcher.fromMenu(() => switcher.pickAndOpen()),
      onWorkspaceSettings: () => window.runCommand(openWorkspaceCommand),
      onClose: () => void switcher.closeShown(),
    });
  return (
    <>
      {/* Each workspace keeps its own tabs in its StudioWorkspace; the key starts its window afresh. */}
      <StudioWindow
        key={shown.location}
        shell={shell}
        workspace={shown.value.workspace}
        host="desktop-app"
        platform={platform}
        language={language}
        switcher={{ workspace: { name: shown.value.name, folder: shown.location }, menu, busy }}
        badges={
          shown.value.trust === undefined ? undefined : (
            <WorkspaceTrustBadge
              trust={shown.value.trust}
              name={shown.value.name}
              toasts={shell.toasts}
              badges={shell.badges}
            />
          )
        }
      />
      {dialog}
      {closeRequest === undefined ? null : (
        <CloseWorkspaceDialog
          request={closeRequest}
          onCancel={() => switcher.cancelClose()}
          onCloseAnyway={() => void switcher.closeAnyway()}
          onTryAgain={() => void switcher.tryCloseAgain()}
          busy={retrying}
        />
      )}
    </>
  );
}

/** Whether a key press happened in a field that has its own undo. */
function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The position Ctrl 1 to Ctrl 9 (⌘1 to ⌘9 on macOS) asks for, without Alt or Shift, which stay
 * with other keys (Alt 1 is the Explorer's).
 */
export function workspaceKeyPosition(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  platform: KeyboardPlatform,
): number | undefined {
  const mod =
    platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey || event.shiftKey || !/^[1-9]$/.test(event.key)) {
    return undefined;
  }
  return Number(event.key);
}
