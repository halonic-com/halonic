import type { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { WelcomeOpenProblem } from "@halonicjs/studio-shell";
import { readWindowContent, WindowContentKeeper } from "./window-content.ts";

/** The parts of the workspace switcher (`WorkspaceSwitcher`) Studio's window content needs. */
export interface ContentSwitcher {
  readonly open: {
    readonly shown: { readonly location: string } | undefined;
    subscribe(listener: () => void): () => void;
  };
  readonly recent: Pick<RecentWorkspaces, "list">;
  openLocation(location: string): Promise<WelcomeOpenProblem | undefined>;
}

/**
 * Studio's window reopens on the workspace it showed (`studio.window-content`), and from then on
 * keeps the one it shows. The workspace reopens only when its location is still in Recent, as its
 * Recent row opens it; otherwise, or when it can't open, the window stays on Welcome and the console
 * says why. Resolves once the window keeps what it shows; the returned function stops keeping it.
 */
export async function keepStudioWorkspace(
  ipc: TauriIpc,
  switcher: ContentSwitcher,
): Promise<() => void> {
  await reopenKept(ipc, switcher);
  const keeper = new WindowContentKeeper(ipc);
  const keepShown = () => keeper.keep(shownOf(switcher));
  const stop = switcher.open.subscribe(() => {
    void keepShown();
  });
  await keepShown();
  return stop;
}

async function reopenKept(ipc: TauriIpc, switcher: ContentSwitcher): Promise<void> {
  const { workspace } = await readWindowContent(ipc);
  if (workspace === undefined || switcher.open.shown !== undefined) return;
  if (!switcher.recent.list().some((remembered) => remembered.location === workspace)) return;
  const problem = await switcher.openLocation(workspace);
  if (problem !== undefined) {
    console.error(`Studio couldn't reopen the workspace at ${workspace}:`, problem);
  }
}

function shownOf(switcher: ContentSwitcher): { workspace?: string } {
  const shown = switcher.open.shown;
  return shown === undefined ? {} : { workspace: shown.location };
}
