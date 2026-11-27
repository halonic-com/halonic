import {
  EmptyState,
  FieldAnnounceProvider,
  framedPanelClass,
  ModalRegionsProvider,
  NarrowProvider,
  type OpenExternal,
  OpenExternalProvider,
  openInNewTab,
  PresentationProvider,
  ToastRegion,
  ToastStoreProvider,
  useWaitedMs,
  WaitingLine,
} from "@halonicjs/studio-kit";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useDocumentLanguage,
  useEscapeClosesTopLayer,
  useNarrowFromWidth,
  usePresentationFromWidth,
  useWindowFocusForAnnouncer,
} from "../frame/frame-effects.ts";
import { FrameRegions } from "../frame/frame-regions.tsx";
import { PageErrorBoundary } from "../page/page-error-boundary.tsx";
import type { FocusedAppContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { Shell } from "../shell.ts";
import { LoadedView } from "../view-loading.tsx";
import { welcomeOpenWords } from "../welcome/welcome-open-words.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { PlaceViewProps } from "./studio-page.tsx";
import type { StudioWorkspace } from "./studio-workspace.ts";
import { type ChosenFormat, WindowFormatLocale } from "./window-format.tsx";
import { appName } from "./window-title.ts";

/**
 * The approved frame of a focused app (HAL-17358): slate-75 behind a white panel in light (HAL-18691),
 * slate-950 behind a slate-900 panel in dark. Exported for a view that draws its own panel on the frame.
 */
export const focusedFrameClass = "bg-app-frame";

/** The focused app's one content panel on {@link focusedFrameClass}: the kit's framed panel. */
export const focusedPanelClass = framedPanelClass("app");

/** What a focused app's window says while Halonic has no workspace to open in it. */
export const focusedWindowWords = {
  noWorkspace: "Open Halonic to choose a workspace.",
  openHalonic: "Open Halonic",
} as const;

/**
 * A focused app's window title: the app's page, the workspace's name when it has one, and the app's
 * own name.
 *
 * @example
 * focusedWindowTitle("Inbox", "Acme"); // "Inbox · Acme · Halonic Inbox"
 * focusedWindowTitle("Inbox"); // "Inbox · Halonic Inbox"
 */
export function focusedWindowTitle(title: string, workspace?: string): string {
  const knowsWorkspace = workspace !== undefined && workspace.trim() !== "";
  const parts = knowsWorkspace ? [title, workspace] : [title];
  return [...parts, `${appName} ${title}`].join(" · ");
}

/** Props for {@link FocusedWindow}. */
export interface FocusedWindowProps {
  /** The registered features and the window's announcer, close stack and toasts. */
  readonly shell: Shell;
  /** The focused app the window's label names, as its feature added it. */
  readonly app: Registered<FocusedAppContribution>;
  /** The workspace Studio last had open, or `undefined` when Halonic has none yet. */
  readonly workspace: StudioWorkspace | undefined;
  /**
   * Whether the window is still opening its workspace: with no `workspace` yet, it then says it
   * reads the workspace instead of saying to open Halonic, and offers to open Halonic after a minute.
   */
  readonly opening?: boolean | undefined;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
  /**
   * The system's region format, such as `en_GB.UTF-8`, read by the desktop app. The app's times
   * follow it, as in Studio's window; without it they follow the browser's language.
   */
  readonly regionFormat?: string | undefined;
  /** The format chosen in Settings → Formats, which the app's times follow over the region's. */
  readonly chosenFormat?: ChosenFormat | undefined;
  /** Brings Studio's window forward, for the "Open Halonic" button while there is no workspace. */
  readonly openStudio: () => void;
}

/**
 * A focused app's window (`shell.focused-apps`): the app's one view on the approved frame, given
 * its feature's context for the open workspace, and none of Studio's tabs, places or status bar.
 * While it still opens its workspace it says so (`shell.focused-app-opening`), and with no
 * workspace it says to open Halonic, with a button that does. Its title is the app's, then the workspace's, then the
 * app's own name: "Inbox · Acme · Halonic Inbox". Below 900px wide its app shows one pane at a
 * time, as in Studio's window, through the kit's `NarrowProvider`, and its times follow the system's
 * region format (`regionFormat`) as Studio's window's do. A `floating` app, quick ask's
 * box, draws on the see-through window itself, with no frame.
 */
export function FocusedWindow(props: FocusedWindowProps) {
  const { shell, app, workspace, opening, language, regionFormat, chosenFormat, openStudio } =
    props;
  const { announcer, closeStack, toasts } = shell;
  const presentation = usePresentationFromWidth();
  const narrow = useNarrowFromWidth();
  useDocumentLanguage(language);
  useEscapeClosesTopLayer(closeStack);
  useWindowFocusForAnnouncer(announcer);
  useEffect(() => {
    document.title = focusedWindowTitle(app.title, workspace?.name);
  }, [app.title, workspace?.name]);

  return (
    <WindowFormatLocale regionFormat={regionFormat} chosenFormat={chosenFormat}>
      <PresentationProvider presentation={presentation}>
        <NarrowProvider narrow={narrow}>
          <ModalRegionsProvider pushModalRegions={(regions) => announcer.pushModalRegions(regions)}>
            <FieldAnnounceProvider announce={(text) => announcer.announce(text)}>
              <ToastStoreProvider store={toasts}>
                <div
                  data-focused-app={app.id}
                  className={`relative flex h-dvh flex-col text-fg ${frameClassOf(app)}`}
                >
                  <FocusedContent
                    shell={shell}
                    app={app}
                    workspace={workspace}
                    opening={opening === true}
                    openStudio={openStudio}
                  />
                  <ToastRegion store={toasts} />
                </div>
                <FrameRegions announcer={announcer} />
              </ToastStoreProvider>
            </FieldAnnounceProvider>
          </ModalRegionsProvider>
        </NarrowProvider>
      </PresentationProvider>
    </WindowFormatLocale>
  );
}

/** The frame round a focused app's view; a floating app's window is see-through, so it has none. */
function frameClassOf(app: FocusedAppContribution): string {
  return app.floating === true ? "" : `p-2 ${focusedFrameClass}`;
}

/** The app's page for the workspace, the wait while it opens, or the way to open Halonic. */
function FocusedContent({
  shell,
  app,
  workspace,
  opening,
  openStudio,
}: {
  readonly shell: Shell;
  readonly app: Registered<FocusedAppContribution>;
  readonly workspace: StudioWorkspace | undefined;
  readonly opening: boolean;
  readonly openStudio: () => void;
}) {
  if (workspace !== undefined) return <FocusedPage shell={shell} app={app} workspace={workspace} />;
  if (opening) return <OpeningWorkspace app={app} openStudio={openStudio} />;
  return <NoWorkspace app={app} openStudio={openStudio} />;
}

/** How long the window waits for its workspace before it offers to open Halonic: as long as Welcome waits for the engine. */
const openHalonicAfterMs = 60_000;

/**
 * The wait while the window opens its workspace (`shell.focused-app-opening`): the line a Recent
 * row shows for the same step, with the time waited, so a slow open is never a blank window. The
 * workspace is chosen and still opening, so after a minute the line stays and only adds the way
 * to Studio's window.
 */
function OpeningWorkspace({
  app,
  openStudio,
}: {
  readonly app: FocusedAppContribution;
  readonly openStudio: () => void;
}) {
  const [since] = useState(() => new Date());
  const waitedMs = useWaitedMs(since);
  const actions =
    waitedMs < openHalonicAfterMs
      ? []
      : [{ label: focusedWindowWords.openHalonic, onClick: openStudio }];
  return (
    <main className={`flex flex-1 items-center justify-center ${focusedPanelClass}`}>
      <h1 className="sr-only">{`${appName} ${app.title}`}</h1>
      <WaitingLine what={welcomeOpenWords.steps.workspace} waitedMs={waitedMs} actions={actions} />
    </main>
  );
}

function NoWorkspace({
  app,
  openStudio,
}: {
  readonly app: FocusedAppContribution;
  readonly openStudio: () => void;
}) {
  return (
    <main className={`flex flex-1 items-center justify-center ${focusedPanelClass}`}>
      <h1 className="sr-only">{`${appName} ${app.title}`}</h1>
      <EmptyState
        title={focusedWindowWords.noWorkspace}
        action={{ label: focusedWindowWords.openHalonic, onClick: openStudio }}
      />
    </main>
  );
}

function FocusedPage({
  shell,
  app,
  workspace,
}: {
  readonly shell: Shell;
  readonly app: Registered<FocusedAppContribution>;
  readonly workspace: StudioWorkspace;
}) {
  const context = useMemo(
    (): WorkspaceContext => ({
      ...shell.services.contextFor(app.featureId, workspace.services),
      host: "desktop-app",
      badges: shell.badges,
      saving: workspace.saving,
      closeStack: shell.closeStack,
    }),
    [shell, app.featureId, workspace],
  );
  const page = (
    <PageErrorBoundary pageKey={app.id} pageName={app.title}>
      <LoadedView<PlaceViewProps> view={app} name={app.title} props={{ context }} />
    </PageErrorBoundary>
  );
  return app.panel === true ? (
    <main className={`flex min-h-0 flex-1 flex-col ${focusedPanelClass}`}>{page}</main>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">{page}</div>
  );
}

/** A {@link FocusedWindow} drawn into a page by {@link mountFocusedWindow}. */
export interface MountedFocusedWindow {
  /** Removes the window from its element. Call it once, when the page goes. */
  unmount(): void;
  /** Draws the window again with other props, such as once its workspace has opened. */
  update(props: FocusedWindowProps): void;
}

/**
 * Draws a {@link FocusedWindow} into an element of the page, in React's strict mode as every Studio
 * page, so `apps/studio` only starts it. Every outside link in it, and every page its app opens,
 * such as a sign-in's approval page, opens with `openExternal`: the desktop app's own, or a new
 * browser tab when it gives none.
 *
 * @example
 * const focused = mountFocusedWindow(root, { shell, app, workspace: undefined, language: "en", openStudio });
 * focused.update({ shell, app, workspace: opened.workspace, language: "en", openStudio });
 */
export function mountFocusedWindow(
  element: Element,
  props: FocusedWindowProps,
  openExternal: OpenExternal = openInNewTab,
): MountedFocusedWindow {
  const root = createRoot(element);
  const render = (shown: FocusedWindowProps) =>
    root.render(
      <StrictMode>
        <OpenExternalProvider openExternal={openExternal}>
          <FocusedWindow {...shown} />
        </OpenExternalProvider>
      </StrictMode>,
    );
  render(props);
  return { unmount: () => root.unmount(), update: render };
}
