import { TauriHostSettingsStore } from "@halonicjs/adapter-fs-tauri";
import type { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { WelcomeOpenProblem } from "@halonicjs/studio-shell";
import { readWindowContent, WindowContentKeeper } from "./window-content.ts";

/**
 * The host setting for Settings › Startup's "Reopen windows on start": the key the shell reads
 * (`open_windows::SETTING`) and the Settings switch saves (`reopenWindowsSetting` in the settings
 * feature, which doesn't export it).
 */
export const reopenWindowsSetting = "windows.reopen-on-start";

/** The parts of the workspace switcher (`WorkspaceSwitcher`) Studio's window content needs. */
export interface ContentSwitcher {
  readonly open: {
    readonly shown: { readonly location: string } | undefined;
    subscribe(listener: () => void): () => void;
  };
  readonly recent: Pick<RecentWorkspaces, "list">;
  /** Opens it beside the person, who may open another folder meanwhile (HAL-19958). */
  reopenOnStart(location: string): Promise<WelcomeOpenProblem | undefined>;
}

/** Studio's window keeping what it shows. */
export interface KeptStudioWorkspace {
  /** Settles once the window has reopened its workspace, or stayed on Welcome, and keeps it. */
  readonly ready: Promise<void>;
  /** Stops keeping at once, without waiting for the workspace to open. */
  stop(): void;
}

/**
 * Studio's window reopens on the workspace it showed (`studio.window-content`), and from then on
 * keeps the one it shows. The workspace reopens only while "Reopen windows on start" is on and its
 * location is still in Recent, as its Recent row opens it; otherwise the window stays on Welcome,
 * and when it can't open the console says why. `stop` works at once: an open still under way is
 * left to finish, and nothing is kept after it.
 */
export function keepStudioWorkspace(ipc: TauriIpc, switcher: ContentSwitcher): KeptStudioWorkspace {
  const stopping = new AbortController();
  let unsubscribe = () => {};
  const ready = (async () => {
    await reopenKept(ipc, switcher);
    if (stopping.signal.aborted) return;
    const keeper = new WindowContentKeeper(ipc);
    const keepShown = () => keeper.keep(shownOf(switcher));
    unsubscribe = switcher.open.subscribe(() => {
      void keepShown();
    });
    await keepShown();
  })();
  return {
    ready,
    stop: () => {
      stopping.abort();
      unsubscribe();
    },
  };
}

async function reopenKept(ipc: TauriIpc, switcher: ContentSwitcher): Promise<void> {
  const { workspace } = await readWindowContent(ipc);
  if (workspace === undefined || switcher.open.shown !== undefined) return;
  if (!switcher.recent.list().some((remembered) => remembered.location === workspace)) return;
  if (!(await reopensWindows(ipc))) return;
  const problem = await switcher.reopenOnStart(workspace);
  if (problem !== undefined) {
    console.error(`Studio couldn't reopen the workspace at ${workspace}:`, problem);
  }
}

/**
 * Whether "Reopen windows on start" is on: on unless saved as `false`, as the shell reads it, and
 * on when the settings can't be read, as the shell then reopens the windows too.
 */
async function reopensWindows(ipc: TauriIpc): Promise<boolean> {
  try {
    const saved = await new TauriHostSettingsStore(ipc).read();
    return saved[reopenWindowsSetting] !== false;
  } catch (error) {
    console.error("Studio couldn't read whether to reopen its workspace:", error);
    return true;
  }
}

function shownOf(switcher: ContentSwitcher): { workspace?: string } {
  const shown = switcher.open.shown;
  return shown === undefined ? {} : { workspace: shown.location };
}
