import type { MouseEvent, ReactNode } from "react";
import type { TabLocation } from "./tab-set.ts";

/** Props for {@link LocationLink}. */
export interface LocationLinkProps {
  readonly location: TabLocation;
  /** Opens the place: in a new tab after a Ctrl-click, a Cmd-click or a middle-click. */
  readonly onOpen: (location: TabLocation, inNewTab: boolean) => void;
  readonly className: string;
  /** Set on the place the user is on, as `aria-current="page"`. */
  readonly current?: boolean;
  readonly children: ReactNode;
}

/**
 * A place the user can go to, as the toolbar's path and the sidebar show it. It is a real link, so
 * a screen reader lists it with the page's links; the shell opens it itself, so the browser never
 * follows the address.
 */
export function LocationLink({
  location,
  onOpen,
  className,
  current,
  children,
}: LocationLinkProps) {
  const open = (event: MouseEvent<HTMLAnchorElement>, inNewTab: boolean) => {
    event.preventDefault();
    onOpen(location, inNewTab);
  };
  return (
    <a
      href={`#${location.key}`}
      aria-current={current === true ? "page" : undefined}
      className={className}
      onClick={(event) => open(event, event.ctrlKey || event.metaKey)}
      onAuxClick={(event) => {
        if (event.button === middleButton) {
          open(event, true);
        }
      }}
    >
      {children}
    </a>
  );
}

const middleButton = 1;
