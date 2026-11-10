import { Button, MenuIcon } from "@halonicjs/studio-kit";
import {
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import { useNarrowWindow } from "./frame-effects.ts";

/** The Places drawer's state, from {@link usePlacesDrawer}. */
export interface PlacesDrawerState {
  /** Whether the window is narrow and has a sidebar, so the sidebar is a drawer. */
  readonly narrow: boolean;
  /** Whether the drawer is open. A window widened past 900px closes it. */
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
  /** The Places button, for giving focus back to it. */
  readonly button: RefObject<HTMLButtonElement | null>;
}

/** Whether the sidebar is the Places drawer now, and whether that drawer is open. */
export function usePlacesDrawer(hasSidebar: boolean): PlacesDrawerState {
  const narrow = useNarrowWindow() && hasSidebar;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const toggle = useCallback(() => setOpen((wasOpen) => !wasOpen), []);
  const close = useCallback(() => setOpen(false), []);
  if (!narrow && open) {
    // Widened past 900px: the sidebar docks again, and the next narrow window starts closed.
    setOpen(false);
  }
  return { narrow, open: narrow && open, toggle, close, button };
}

/** Props for {@link PlacesButton}. */
export interface PlacesButtonProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly ref: RefObject<HTMLButtonElement | null>;
}

/**
 * The narrow window's menu button at the toolbar's left (component specs 24.4, VK T2-F44): a `md`
 * ghost icon Button named "Places", with `aria-expanded`. It stays in view while the drawer is
 * open, on the `surface-muted` fill, and a click on it closes the drawer again.
 */
export function PlacesButton({ open, onToggle, ref }: PlacesButtonProps) {
  return (
    <span className={open ? "rounded-sm bg-surface-muted" : undefined}>
      <Button
        ref={ref}
        variant="ghost"
        icon={<MenuIcon />}
        label="Places"
        aria-expanded={open}
        onClick={onToggle}
      />
    </span>
  );
}

/** Props for {@link SidebarSlot}. */
export interface SidebarSlotProps {
  /** Whether the window is narrow, so the sidebar is the Places drawer. */
  readonly narrow: boolean;
  /**
   * Whether the drawer is open; never on a wide window. Closed, it stays mounted but hidden, so
   * the sidebar keeps its state.
   */
  readonly open: boolean;
  /** The window's close stack: an open drawer is a layer Esc closes. */
  readonly closeStack: CloseStack;
  /** Closes the drawer. It must keep its identity across renders. */
  readonly onClose: () => void;
  /** The Places button, where focus goes back when the drawer closes and nothing else took it. */
  readonly button: RefObject<HTMLButtonElement | null>;
  /** The sidebar. */
  readonly children: ReactNode;
}

/**
 * Where the sidebar goes, as one element in both layouts, so the sidebar keeps its state when the
 * window crosses 900px. On a wide window it docks beside the page and adds no box of its own.
 *
 * The narrow window's sidebar (600 to 899px, component specs 24.4 S4, VK T2-F45 to F47): the same
 * sidebar as a 264px drawer from the left, under the toolbar and over the status bar, on
 * `surface-subtle` with `shadow-3`. The `--stack-scrim` covers only the page beside it, and the
 * page is inert while it's open. There's no close button and no slide.
 *
 * When it opens, focus goes to the current place's item, or the first item when no place is
 * current. A pick closes it, and the place's page takes the focus on its `h1`. Esc, a click on the
 * scrim or the Places button closes it too, and focus goes back to the button. Focus moving on to
 * something else outside it closes it and leaves the focus there.
 */
export function SidebarSlot(props: SidebarSlotProps) {
  const { narrow, open, closeStack, onClose, button, children } = props;
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    return closeStack.open({
      kind: "drawer",
      close: () => {
        onClose();
        return true;
      },
    });
  }, [open, closeStack, onClose]);

  useFocusOnOpenAndClose(open, drawer, button);

  // A pick is a click on a link: the place opens and the drawer gets out of the way.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a[href]") !== null) {
      onClose();
    }
  };

  // A press on the Places button takes the focus first and then closes the drawer itself.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next !== null && !event.currentTarget.contains(next) && next !== button.current) {
      onClose();
    }
  };

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it only hears the links' own clicks and focus, Enter included. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a link's Enter is a click, so the keyboard is covered. */}
      <div
        ref={drawer}
        hidden={narrow && !open}
        className={narrow ? drawerClasses : "contents"}
        onClick={narrow ? onClick : undefined}
        onBlur={narrow ? onBlur : undefined}
      >
        {children}
      </div>
      {open ? (
        // The scrim is for the pointer only; the keyboard closes the drawer with Esc.
        <div
          aria-hidden="true"
          className="absolute inset-y-0 start-sidebar end-0 z-20 bg-(--stack-scrim)"
          onClick={onClose}
        />
      ) : null}
    </>
  );
}

/**
 * The drawer is always 264px. The sidebar sets its own width inline, from its resize edge (180 to
 * 640px), so `*:w-full!` holds it to the drawer's width over that inline style.
 */
const drawerClasses =
  "absolute inset-y-0 start-0 z-20 flex w-sidebar bg-surface-subtle shadow-3 *:w-full!";

/**
 * On open, focus goes to the current place's item (`aria-current="page"`), else the first link. On
 * close, focus goes back to the button only when it was left in the drawer or dropped to the body:
 * a pick already moved it to the new page's `h1`, and that runs first, in the list's own effect.
 */
function useFocusOnOpenAndClose(
  open: boolean,
  drawer: RefObject<HTMLDivElement | null>,
  button: RefObject<HTMLButtonElement | null>,
): void {
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const element = drawer.current;
    if (open && !wasOpen.current && element !== null) {
      const place =
        element.querySelector<HTMLElement>('[aria-current="page"]') ??
        element.querySelector<HTMLElement>("a[href]");
      place?.focus();
    }
    if (!open && wasOpen.current && element !== null) {
      const focused = document.activeElement;
      if (focused === null || focused === document.body || element.contains(focused)) {
        button.current?.focus();
      }
    }
    wasOpen.current = open;
  }, [open, drawer, button]);
}
