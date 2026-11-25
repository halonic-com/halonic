import {
  EmptyState,
  FieldAnnounceProvider,
  ModalRegionsProvider,
  PresentationProvider,
  ToastRegion,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { StrictMode, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  useDocumentLanguage,
  useEscapeClosesTopLayer,
  usePresentationFromWidth,
  useWindowFocusForAnnouncer,
} from "../frame/frame-effects.ts";
import { FrameRegions } from "../frame/frame-regions.tsx";
import { PageErrorBoundary } from "../page/page-error-boundary.tsx";
import type { FocusedAppContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { Shell } from "../shell.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { PlaceViewProps } from "./studio-page.tsx";
import type { StudioWorkspace } from "./studio-workspace.ts";
import { appName } from "./window-title.ts";

/**
 * The approved frame of a focused app (HAL-17358): slate-50 behind a white panel in light, slate-950
 * behind a slate-900 panel in dark. Exported for a view that draws its own panel on the frame.
 */
export const focusedFrameClass = "bg-app-frame";

/** The focused app's one content panel on {@link focusedFrameClass}. */
export const focusedPanelClass = "overflow-hidden rounded-lg border border-border bg-app-panel";

/** What a focused app's window says while Halonic has no workspace to open in it. */
export const focusedWindowWords = {
  noWorkspace: "Open Halonic to choose a workspace.",
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
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
}

/**
 * A focused app's window (`shell.focused-apps`): the app's one view on the approved frame, given
 * its feature's context for the open workspace, and none of Studio's tabs, places or status bar.
 * With no workspace it says to open Halonic. Its title is the app's, then the workspace's, then the
 * app's own name: "Inbox · Acme · Halonic Inbox".
 */
export function FocusedWindow({ shell, app, workspace, language }: FocusedWindowProps) {
  const { announcer, closeStack, toasts } = shell;
  const presentation = usePresentationFromWidth();
  useDocumentLanguage(language);
  useEscapeClosesTopLayer(closeStack);
  useWindowFocusForAnnouncer(announcer);
  useEffect(() => {
    document.title = focusedWindowTitle(app.title, workspace?.name);
  }, [app.title, workspace?.name]);

  return (
    <PresentationProvider presentation={presentation}>
      <ModalRegionsProvider pushModalRegions={(regions) => announcer.pushModalRegions(regions)}>
        <FieldAnnounceProvider announce={(text) => announcer.announce(text)}>
          <ToastStoreProvider store={toasts}>
            <div
              data-focused-app={app.id}
              className={`relative flex h-dvh flex-col p-2 text-fg ${focusedFrameClass}`}
            >
              {workspace === undefined ? (
                <NoWorkspace app={app} />
              ) : (
                <FocusedPage shell={shell} app={app} workspace={workspace} />
              )}
              <ToastRegion store={toasts} />
            </div>
            <FrameRegions announcer={announcer} />
          </ToastStoreProvider>
        </FieldAnnounceProvider>
      </ModalRegionsProvider>
    </PresentationProvider>
  );
}

function NoWorkspace({ app }: { readonly app: FocusedAppContribution }) {
  return (
    <main className={`flex flex-1 items-center justify-center ${focusedPanelClass}`}>
      <h1 className="sr-only">{`${appName} ${app.title}`}</h1>
      <EmptyState title={focusedWindowWords.noWorkspace} />
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
 * page, so `apps/studio` only starts it.
 *
 * @example
 * const focused = mountFocusedWindow(root, { shell, app, workspace: undefined, language: "en" });
 * focused.update({ shell, app, workspace: opened.workspace, language: "en" });
 */
export function mountFocusedWindow(
  element: Element,
  props: FocusedWindowProps,
): MountedFocusedWindow {
  const root = createRoot(element);
  const render = (shown: FocusedWindowProps) =>
    root.render(
      <StrictMode>
        <FocusedWindow {...shown} />
      </StrictMode>,
    );
  render(props);
  return { unmount: () => root.unmount(), update: render };
}
