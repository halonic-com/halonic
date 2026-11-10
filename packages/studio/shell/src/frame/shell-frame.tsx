import {
  ModalRegionsProvider,
  type Presentation,
  PresentationProvider,
  ToastRegion,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { CloseStack } from "../close-stack/close-stack.ts";
import type { ShellEngine } from "../engine/engine-connection.ts";
import { EngineLine } from "../engine/engine-line.tsx";
import {
  useDocumentLanguage,
  useEscapeClosesTopLayer,
  usePresentationFromWidth,
  useWindowFocusForAnnouncer,
} from "./frame-effects.ts";
import { FrameRegions } from "./frame-regions.tsx";
import { PlacesButton, SidebarSlot, usePlacesDrawer } from "./sidebar-slot.tsx";

/** Props for {@link ShellFrame}. */
export interface ShellFrameProps {
  /** The window's one announcer; the frame mounts its live regions. */
  readonly announcer: Announcer;
  /** The window's one close stack; the frame passes Esc to it. */
  readonly closeStack: CloseStack;
  /** The window's toasts; the frame shows them once, at the bottom right of the content area. */
  readonly toasts: ToastStore;
  /** The window's engine connection; the frame shows its one line while it isn't answering. */
  readonly engine: ShellEngine;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
  /** The title bar's content on the desktop: the logo, the window tabs, +. */
  readonly titleBar?: ReactNode;
  /** The toolbar's content on the desktop: Back and Forward, the path, Saved. */
  readonly toolbar?: ReactNode;
  /**
   * The sidebar on the desktop. It sets its own width on a wide window; in a narrow window
   * (`useNarrowWindow`) it fills the 264px Places drawer the toolbar's Places button opens.
   */
  readonly sidebar?: ReactNode;
  /** The status bar's content on the desktop. */
  readonly statusBar?: ReactNode;
  /** The page. */
  readonly children: ReactNode;
}

/**
 * The Studio window's frame. On the desktop it has three layers (design direction 2): the 40px
 * title bar on the halo, then the panel set into the halo with a 12px radius, holding three rows:
 * the toolbar, the sidebar beside the page, and the 24px status bar. On a phone (narrower than `PHONE_MAX_WIDTH`) it
 * shows the page only, with no window tabs and no status bar; the phone's own bars come later.
 * In a narrow window (600 to 899px) the sidebar folds into the Places drawer, opened by a Places
 * button at the toolbar's left.
 * While the engine isn't answering, its one line sits over the sidebar and the page, under the
 * toolbar on the desktop and at the top on a phone.
 *
 * Everything inside learns the layout through the kit's `PresentationProvider`, and every kit
 * Dialog sends its announcements through the window's announcer. The window's one `ToastRegion`
 * sits over the sidebar and the page (on a phone, the page), so a toast never covers the status
 * bar, and kit parts that confirm with a toast find the store through `ToastStoreProvider`.
 *
 * @example
 * <ShellFrame
 *   announcer={shell.announcer}
 *   closeStack={shell.closeStack}
 *   engine={shell.engine}
 *   toasts={shell.toasts}
 *   language="en"
 * >
 *   <HomePage />
 * </ShellFrame>
 */
export function ShellFrame(props: ShellFrameProps) {
  const { announcer, closeStack, toasts, language } = props;
  const presentation = usePresentationFromWidth();
  useDocumentLanguage(language);
  useEscapeClosesTopLayer(closeStack);
  useWindowFocusForAnnouncer(announcer);

  return (
    <PresentationProvider presentation={presentation}>
      <ModalRegionsProvider pushModalRegions={(regions) => announcer.pushModalRegions(regions)}>
        <ToastStoreProvider store={toasts}>
          <FrameLayers presentation={presentation} {...props} />
          <FrameRegions announcer={announcer} />
        </ToastStoreProvider>
      </ModalRegionsProvider>
    </PresentationProvider>
  );
}

/**
 * Both layouts are one tree: the phone leaves the desktop's bars out but keeps their places
 * (`null`), so `main` stays at the same position and React keeps the page, with its typed text,
 * scroll and focus, when the width crosses `PHONE_MAX_WIDTH`.
 */
function FrameLayers(props: ShellFrameProps & { readonly presentation: Presentation }) {
  const desktop = props.presentation === "desktop";
  const drawer = usePlacesDrawer(props.sidebar !== undefined);
  return (
    <div
      data-layout={props.presentation}
      className={`flex h-dvh flex-col text-fg ${desktop ? "bg-halo-frame px-2 pb-2" : "bg-surface"}`}
    >
      {desktop ? (
        <header className="flex h-titlebar shrink-0 items-end gap-0.5 ps-1">
          {props.titleBar}
        </header>
      ) : null}
      <div
        className={`flex min-h-0 flex-1 flex-col bg-surface ${desktop ? "overflow-hidden rounded-md border border-border" : ""}`}
      >
        {desktop ? (
          <div className="flex h-toolbar shrink-0 items-center gap-1 border-b border-border px-2">
            {drawer.narrow ? (
              <PlacesButton open={drawer.open} onToggle={drawer.toggle} ref={drawer.button} />
            ) : null}
            {props.toolbar}
          </div>
        ) : null}
        <EngineLine engine={props.engine} />
        <div className="relative flex min-h-0 flex-1">
          {desktop ? (
            <SidebarSlot
              narrow={drawer.narrow}
              open={drawer.open}
              closeStack={props.closeStack}
              onClose={drawer.close}
              button={drawer.button}
            >
              {props.sidebar}
            </SidebarSlot>
          ) : null}
          <main className="min-w-0 flex-1 overflow-auto" inert={drawer.open}>
            {props.children}
          </main>
          <ToastRegion store={props.toasts} />
        </div>
        {desktop ? (
          <footer className="flex h-statusbar shrink-0 items-center gap-4 border-t border-border bg-surface-subtle px-3 text-caption text-fg-muted">
            {props.statusBar}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
