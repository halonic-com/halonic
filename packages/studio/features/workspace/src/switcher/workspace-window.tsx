import {
  type KeyboardPlatform,
  type Shell,
  StudioWindow,
  WelcomeWindow,
} from "@halonicjs/studio-shell";
import { useEffect, useSyncExternalStore } from "react";
import { workspaceMenu } from "./workspace-menu.ts";
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
export function WorkspaceWindow({ shell, switcher, platform, language }: WorkspaceWindowProps) {
  const { open } = switcher;
  const shown = useSyncExternalStore(
    (onChange) => open.subscribe(onChange),
    () => open.shown,
  );
  // The menu reads Recent as it draws, so a row removed from a toast goes at once.
  useSyncExternalStore(
    (onChange) => switcher.recent.subscribe(onChange),
    () => switcher.recent.version,
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const position = workspaceKeyPosition(event, platform);
      if (position !== undefined) {
        event.preventDefault();
        switcher.showAt(position);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [switcher, platform]);

  if (shown === undefined) {
    return (
      <WelcomeWindow
        shell={shell}
        language={language}
        onOpenFolder={() => switcher.pickAndOpen()}
      />
    );
  }
  const menu = workspaceMenu({
    recent: switcher.recent.list(),
    open: open.all.map((slot) => slot.location),
    shown: shown.location,
    platform,
    onOpen: (location) => void switcher.fromMenu(() => switcher.openLocation(location), true),
    onOpenFolder: () => void switcher.fromMenu(() => switcher.pickAndOpen()),
    onClose: () => void switcher.closeShown(),
  });
  return (
    // Each workspace keeps its own tabs in its StudioWorkspace; the key starts its window afresh.
    <StudioWindow
      key={shown.location}
      shell={shell}
      workspace={shown.value.workspace}
      host="desktop-app"
      platform={platform}
      language={language}
      switcher={{ workspace: { name: shown.value.name, folder: shown.location }, menu }}
    />
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
