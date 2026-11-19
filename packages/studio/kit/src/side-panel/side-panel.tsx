import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Button } from "../button/button.tsx";
import { BackIcon } from "../icons/back-icon.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { SkeletonBar, type SkeletonBarWidth } from "../skeleton-bar/skeleton-bar.tsx";

/** Props of the kit's `SidePanel`. */
export interface SidePanelProps {
  /** The panel's heading, in `text-section` (`text-heading` on a phone): "Sort the inbox". */
  readonly title: string;
  /** The region's name when it should stay put while the title changes: "Assistant". */
  readonly label?: string | undefined;
  /**
   * The header's right side, filled by the shell: `sm` ghost icon buttons, maximise when allowed,
   * then close. On a phone the shell fills it without maximise.
   */
  readonly actions?: ReactNode;
  /** The body. For a body that couldn't load, an `EmptyState` with `tone="error"`. */
  readonly children?: ReactNode;
  /** Actions at the bottom, right-aligned `sm` buttons. On a phone, a bottom action bar. */
  readonly footer?: ReactNode;
  /** While it loads: what screen readers hear ("Loading Sort the inbox"); the body is skeleton lines. */
  readonly loading?: string | undefined;
  /** The halo wash at the top of the body. The Assistant's panel only. */
  readonly halo?: boolean;
  /** Which side faces the main view and gets the 1px line. `start` (the default) for a panel on the right. */
  readonly facing?: "start" | "end";
  /**
   * Gets focus instead of the title when the panel opens, for a panel you open to type in (the
   * assistant's composer). Ignored on a phone, where it would open the keyboard at once.
   */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  /** The phone's Back button. On desktop the shell puts close in `actions` and binds Escape. */
  readonly onClose: () => void;
  /**
   * The title's id, for a panel inside a dialog that the title names (a sheet's `<dialog>`). The
   * panel then draws no `complementary` region of its own, so a screen reader hears its name once,
   * as the dialog's, and not again as a region's. Its header and footer are plain blocks then:
   * outside the region they'd be the window's `banner` and `contentinfo`.
   */
  readonly dialogTitleId?: string | undefined;
}

/** Title and meta bar widths, one pair per line of the loading body. */
const lines: readonly (readonly [SkeletonBarWidth, SkeletonBarWidth])[] = [
  ["2/5", "7/10"],
  ["1/2", "full"],
  ["1/3", "3/5"],
];

/**
 * The frame every side panel shares: header, scrolling body, optional footer. It fills what the
 * shell gives it and never sets its own width: the shell applies `w-panel`, maximise and any
 * resizing. On a phone (presentation `phone`) it's a panel sheet: the whole screen, with Back at
 * the top left. Opening it moves focus to its title; closing it moves focus back.
 *
 * @example
 * <div className="w-panel">
 *   <SidePanel title="Sort the inbox" actions={<PanelButtons />} onClose={close}>
 *     <StepDetails step={step} />
 *   </SidePanel>
 * </div>
 */
export function SidePanel(props: SidePanelProps) {
  const sheet = usePresentation() === "phone";
  const ownTitleId = useId();
  const titleId = props.dialogTitleId ?? ownTitleId;
  const inDialog = props.dialogTitleId !== undefined;
  const Footer = inDialog ? "div" : "footer";
  const title = useRef<HTMLHeadingElement>(null);
  usePanelFocus(title, sheet ? undefined : props.initialFocus);
  const className = `flex h-full min-h-0 flex-col bg-surface text-fg ${edge(props, sheet)}`;
  const content = (
    <>
      <PanelHeader
        props={props}
        sheet={sheet}
        inDialog={inDialog}
        titleId={titleId}
        title={title}
      />
      <div
        aria-busy={props.loading === undefined ? undefined : true}
        className={`min-h-0 flex-1 overflow-y-auto px-4 py-3${props.halo === true ? " bg-halo-wash" : ""}`}
      >
        {props.loading === undefined ? props.children : <LoadingLines />}
      </div>
      {props.loading === undefined ? null : (
        <span role="status" className="sr-only">
          {props.loading}
        </span>
      )}
      {props.footer === undefined ? null : (
        <Footer
          className={
            sheet
              ? "flex flex-wrap gap-2 border-t border-border px-4 pt-3 pb-safe"
              : "flex h-12 items-center justify-end gap-2 border-t border-border px-4"
          }
        >
          {props.footer}
        </Footer>
      )}
    </>
  );

  if (inDialog) {
    return <div className={className}>{content}</div>;
  }
  return (
    <aside
      aria-label={props.label}
      aria-labelledby={props.label === undefined ? titleId : undefined}
      className={className}
    >
      {content}
    </aside>
  );
}

interface PanelHeaderProps {
  readonly props: SidePanelProps;
  readonly sheet: boolean;
  readonly inDialog: boolean;
  readonly titleId: string;
  readonly title: RefObject<HTMLHeadingElement | null>;
}

/** The title and the shell's actions; on a phone, the top bar with Back first. */
function PanelHeader({ props, sheet, inDialog, titleId, title }: PanelHeaderProps) {
  const Header = inDialog ? "div" : "header";
  return (
    <Header
      className={
        sheet
          ? "flex phone-top-bar items-center gap-1 border-b border-border px-1"
          : "flex h-12 items-center gap-2 border-b border-border pr-2.5 pl-4"
      }
    >
      {sheet ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<BackIcon />}
          label="Back"
          onClick={props.onClose}
        />
      ) : null}
      <h2
        ref={title}
        id={titleId}
        tabIndex={-1}
        className={`min-w-0 flex-1 truncate ${sheet ? "text-heading" : "text-section"}`}
      >
        {props.title}
      </h2>
      {props.actions === undefined ? null : (
        <div className="flex shrink-0 gap-1">{props.actions}</div>
      )}
    </Header>
  );
}

function edge(props: SidePanelProps, sheet: boolean): string {
  if (sheet) {
    return "";
  }
  return props.facing === "end" ? "border-e border-border" : "border-s border-border";
}

/** Still skeleton lines, the same bars as a List's skeleton rows: a title bar over a meta bar. */
function LoadingLines() {
  return (
    <div className="flex flex-col gap-4">
      {lines.map(([title, meta]) => (
        <div key={title} className="flex flex-col gap-2">
          <SkeletonBar kind="title" width={title} />
          <SkeletonBar kind="meta" width={meta} />
        </div>
      ))}
    </div>
  );
}

/**
 * Focus to `initialFocus` (when it's there) or the title on open. On close, if focus went with
 * the panel, back to what had focus before; when that has gone or is inert, to the page's `h1`.
 */
function usePanelFocus(
  title: RefObject<HTMLHeadingElement | null>,
  initialFocus: RefObject<HTMLElement | null> | undefined,
): void {
  const opener = useRef<HTMLElement | null>(null);

  // Only on open: a later change of the ref must not pull focus back.
  useLayoutEffect(() => {
    const focused = document.activeElement;
    // StrictMode runs this twice while the panel stays open; the second time focus is already
    // in the panel, and the panel's own title isn't where focus goes back to.
    const inPanel = focused !== null && title.current?.closest("aside")?.contains(focused) === true;
    if (!inPanel) {
      opener.current = focused instanceof HTMLElement ? focused : null;
    }
    (initialFocus?.current ?? title.current)?.focus();
  }, []);

  useEffect(
    () => () => {
      if (document.activeElement !== null && document.activeElement !== document.body) {
        return;
      }
      const before = opener.current;
      const back =
        before?.isConnected === true && before.closest("[inert]") === null
          ? before
          : document.querySelector<HTMLElement>("h1");
      back?.focus();
    },
    [],
  );
}
