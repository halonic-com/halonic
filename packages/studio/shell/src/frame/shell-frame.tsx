import {
  FieldAnnounceProvider,
  ModalRegionsProvider,
  NarrowProvider,
  type Presentation,
  PresentationProvider,
  ToastRegion,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import type { ReactNode, RefObject } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { CloseStack } from "../close-stack/close-stack.ts";
import type { ShellEngine } from "../engine/engine-connection.ts";
import { EngineLine } from "../engine/engine-line.tsx";
import {
  useDocumentLanguage,
  useEscapeClosesTopLayer,
  useInputModality,
  useNarrowFromWidth,
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
  /**
   * The title bar's content on the desktop: the Halonic Studio mark, Back and Forward, the window
   * tabs, +. In a narrow window the frame puts the Places button before it.
   */
  readonly titleBar?: ReactNode;
  /**
   * The sidebar on the desktop. It sets its own width on a wide window; in a narrow window
   * (`useNarrowWindow`) it fills the 264px Places drawer the title bar's Places button opens.
   */
  readonly sidebar?: ReactNode;
  /** The status bar's content on the desktop. */
  readonly statusBar?: ReactNode;
  /**
   * The workspace's header badges ("Not trusted yet") on the desktop, at the status bar's left
   * edge, before the other items. Left out, the slot takes no room.
   */
  readonly badges?: ReactNode;
  /**
   * What opens over the window on the desktop and on a phone alike, such as the trust check the
   * header badge and a refused start open. It sits in the frame, so a Dialog learns the layout.
   */
  readonly dialogs?: ReactNode;
  /** The workspace's save note ("✓ Saved") on the desktop, at the status bar's right end. */
  readonly saveNote?: ReactNode;
  /**
   * The header badges on a phone, as rows of the notice strip under the top bar
   * (`HeaderBadges` with `layout="strip"`). Left out, the strip shows only a save problem.
   */
  readonly phoneBadges?: ReactNode;
  /**
   * The strips under the top bar, `Strips`, such as the first-run bar: at the top of the page
   * column on the desktop, beside the full-height sidebar, and under the top bar on a phone, after
   * the engine's line in both.
   */
  readonly strips?: ReactNode;
  /** The top bar on a phone, `PhoneTopBar`: Back, the place or page title, its actions. */
  readonly phoneTopBar?: ReactNode;
  /**
   * The bottom navigation on a phone, `BottomNavigation`, while the page is a place or a list.
   * Left out on an opened item, so the page can put its own bar at the bottom: one bar at a time.
   */
  readonly phoneNavigation?: ReactNode;
  /**
   * Receives the title bar's Places button while the window is narrow, for a dialog opened from the
   * drawer to give focus back to.
   */
  readonly placesButton?: RefObject<HTMLButtonElement | null>;
  /**
   * Names the page shown, such as the active tab's place. When it changes while the Places drawer
   * is open, something in it opened that page, so the drawer closes and the page keeps the focus.
   */
  readonly shownPage?: string;
  /**
   * The open side panel, `PanelWindowSlot`: on the desktop at the right of the content area, and
   * under 900px over it, so the frame makes the page inert while it shows. On a phone it's a full
   * page (`shell.phone-panel`): the top bar, the lines under it and the bottom navigation make way
   * for it, and the page stays, inert, under it, so it comes back as it was.
   */
  readonly panel?: ReactNode;
  /** The page. */
  readonly children: ReactNode;
}

/**
 * The Studio window's frame. On the desktop it has three layers (design direction 2): the 40px
 * title bar on the halo, then the panel set into the halo with a 12px radius, holding two rows:
 * the sidebar beside the page, and the 24px status bar. On a phone (narrower than `PHONE_MAX_WIDTH`) it
 * shows the phone's top bar, the page and the bottom navigation, with no window tabs and no
 * status bar (component specs 15.1, 15.2).
 * In a narrow window (600 to 899px) the sidebar folds into the Places drawer, opened by a Places
 * button at the title bar's far left.
 * While the engine isn't answering, its one line sits over the sidebar and the page, at the top of
 * the panel on the desktop and under the top bar on a phone.
 *
 * Everything inside learns the layout through the kit's `PresentationProvider`, and whether the
 * window is narrower than 900px through its `NarrowProvider`; every kit
 * Dialog sends its announcements through the window's announcer, as does every kit Field whose
 * error appears after focus has left it. The window's one `ToastRegion`
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
  const narrow = useNarrowFromWidth();
  useDocumentLanguage(language);
  useEscapeClosesTopLayer(closeStack);
  useInputModality();
  useWindowFocusForAnnouncer(announcer);

  return (
    <PresentationProvider presentation={presentation}>
      <NarrowProvider narrow={narrow}>
        <ModalRegionsProvider pushModalRegions={(regions) => announcer.pushModalRegions(regions)}>
          <FieldAnnounceProvider announce={(text) => announcer.announce(text)}>
            <ToastStoreProvider store={toasts}>
              <FrameLayers presentation={presentation} {...props} />
              <FrameRegions announcer={announcer} />
              {props.dialogs}
            </ToastStoreProvider>
          </FieldAnnounceProvider>
        </ModalRegionsProvider>
      </NarrowProvider>
    </PresentationProvider>
  );
}

const panel = "overflow-hidden rounded-md border border-border";

/**
 * On a short phone window (400 % zoom, a phone held sideways) the bars would leave the page no room,
 * so the column scrolls as one, bars included, as a kit Dialog does (component specs 8, "Short of
 * room"). The content still fills the room left, so the bottom navigation stays at the bottom of a
 * page that doesn't fill the window.
 */
const phoneColumn = "short:overflow-y-auto";
const phoneContent = "short:flex-[1_0_auto]";
const phonePage = "short:overflow-visible";

/**
 * Both layouts are one tree: the phone puts its own bars where the desktop's panel top and status
 * bar go, and leaves the title bar out but keeps its place (`null`), so `main` stays at the same
 * position and React keeps the page, with its typed text, scroll and focus, when the width crosses
 * `PHONE_MAX_WIDTH`.
 */
function FrameLayers(props: ShellFrameProps & { readonly presentation: Presentation }) {
  const desktop = props.presentation === "desktop";
  const drawer = usePlacesDrawer(props.sidebar !== undefined, props.placesButton, props.shownPage);
  // Under 900px an open side panel covers the page, which mustn't take focus behind it.
  const covered = desktop && drawer.narrow && hasContent(props.panel);
  const phonePanel = !desktop && hasContent(props.panel);
  return (
    <div
      data-layout={props.presentation}
      className={`flex h-dvh flex-col text-fg ${desktop ? "bg-halo-frame px-2 pb-2" : "bg-surface"}`}
    >
      {desktop ? (
        <header className="flex h-titlebar shrink-0 items-end gap-0.5 ps-1">
          {drawer.narrow ? (
            <span className="self-center">
              <PlacesButton
                open={drawer.open}
                controls={drawer.drawerId}
                onToggle={drawer.toggle}
                ref={drawer.button}
              />
            </span>
          ) : null}
          {props.titleBar}
        </header>
      ) : null}
      <div className={`flex min-h-0 flex-1 flex-col bg-surface ${desktop ? panel : phoneColumn}`}>
        <TopLines props={props} desktop={desktop} phonePanel={phonePanel} />
        <div className={`relative flex min-h-0 flex-1 ${desktop ? "" : phoneContent}`}>
          {desktop ? (
            <SidebarSlot
              narrow={drawer.narrow}
              open={drawer.open}
              closeStack={props.closeStack}
              onClose={drawer.close}
              button={drawer.button}
              id={drawer.drawerId}
              shownPage={props.shownPage}
            >
              {props.sidebar}
            </SidebarSlot>
          ) : null}
          <PageColumn
            desktop={desktop}
            inert={drawer.open || covered || phonePanel}
            strips={props.strips}
          >
            {props.children}
          </PageColumn>
          {props.panel}
          <ToastRegion store={props.toasts} />
        </div>
        {desktop ? (
          <DesktopStatusBar
            badges={props.badges}
            statusBar={props.statusBar}
            saveNote={props.saveNote}
          />
        ) : null}
        {desktop || phonePanel ? null : props.phoneNavigation}
      </div>
    </div>
  );
}

/**
 * What sits above the page: the engine's line, and on a phone the top bar first and the strips and
 * the notice strip after it. A phone's full-page panel takes the place of all of them.
 */
function TopLines(props: {
  readonly props: ShellFrameProps;
  readonly desktop: boolean;
  readonly phonePanel: boolean;
}) {
  const { props: frame, desktop, phonePanel } = props;
  if (phonePanel) return null;
  return (
    <>
      {desktop ? null : frame.phoneTopBar}
      <EngineLine engine={frame.engine} />
      {desktop ? null : frame.strips}
      {desktop ? null : <PhoneNotices saveNote={frame.saveNote} badges={frame.phoneBadges} />}
    </>
  );
}

/**
 * The page's column, beside the sidebar: on the desktop the strips at its top, over the page (sheet
 * 05, so the sidebar stays full height), then `main`. It's there in both layouts, so `main` keeps its
 * place when the width crosses `PHONE_MAX_WIDTH`. While the Places drawer is open its scrim covers
 * the strips too, so they are inert with the page. Only the inner div, a column's item, grows in a
 * short window: on the outer one, an item of a row, `flex-[1_0_auto]` took the page's widest line
 * as its width and wouldn't shrink, so the page ran off a narrow window (C606).
 */
function PageColumn(props: {
  readonly desktop: boolean;
  readonly inert: boolean;
  readonly strips: ReactNode;
  readonly children: ReactNode;
}) {
  const grow = props.desktop ? "" : phoneContent;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" inert={props.inert}>
      {props.desktop ? props.strips : null}
      <div className={`flex min-h-0 flex-1 ${grow}`}>
        <main
          className={`min-w-0 flex-1 overflow-auto ${props.desktop ? "" : phonePage}`}
          inert={props.inert}
        >
          {props.children}
        </main>
      </div>
    </div>
  );
}

/** The desktop's status bar: the header badges first, the features' items, the save note last. */
function DesktopStatusBar(props: Pick<ShellFrameProps, "badges" | "statusBar" | "saveNote">) {
  return (
    <footer className={statusBarClasses}>
      {hasContent(props.badges) ? (
        <div className="flex shrink-0 items-center gap-2 empty:hidden">{props.badges}</div>
      ) : null}
      {props.statusBar}
      {hasContent(props.saveNote) ? <div className="ms-auto shrink-0">{props.saveNote}</div> : null}
    </footer>
  );
}

/**
 * While the save note is a problem, the whole bar takes the soft fill of its mark's tone, fading in
 * 120ms (none under reduced motion). The badges never colour the bar: they are standing states.
 * `box-content` keeps the 24px inside the top border, so the 24px badges and Problems pill sit
 * between the divider and the frame's bottom edge instead of 1px over it (C794).
 */
const statusBarClasses = [
  "group/bar box-content flex h-statusbar shrink-0 items-center gap-4 border-t border-border bg-surface-subtle px-3 text-caption text-fg-muted",
  "transition-colors has-[[data-problem=warning]]:bg-warning-soft has-[[data-problem=danger]]:bg-danger-soft",
].join(" ");

/**
 * On a phone, which has no status bar, the save note and the header badges show in a strip under
 * the top bar and the engine line: first the save note's row, only while it's a problem, full width
 * with the problem's soft fill edge to edge, then the badges' rows (HAL-12557). Each row draws the
 * line under it. The strip is part of the frame, so it doesn't scroll away with the page. With no
 * problem and no badge, the strip takes no room; "Saved" and "Saving…" don't show on a phone.
 */
function PhoneNotices({
  saveNote,
  badges,
}: {
  readonly saveNote: ReactNode;
  readonly badges: ReactNode;
}) {
  if (!hasContent(saveNote) && !hasContent(badges)) {
    return null;
  }
  return (
    <div data-phone-notices="" className="flex shrink-0 flex-col">
      {hasContent(saveNote) ? (
        <div data-notice-save="" className={saveRowClasses}>
          {saveNote}
        </div>
      ) : null}
      {badges}
    </div>
  );
}

const saveRowClasses = [
  "hidden min-h-touch items-center border-b border-border ps-4 pe-1 has-[[data-problem]]:flex",
  "has-[[data-problem=warning]]:bg-warning-soft has-[[data-problem=danger]]:bg-danger-soft",
].join(" ");

/** Whether a slot was given something to show; `null`, `false` and nothing take no room. */
function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}
