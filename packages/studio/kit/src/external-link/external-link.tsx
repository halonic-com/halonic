import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { useOpenExternal } from "./open-external.tsx";

/** An `ExternalLink` to a page whose address is known now. */
interface ExternalLinkToAddress {
  /** The page to open: an `http` or `https` address. Anything else throws. */
  readonly href: string;
  /**
   * Where the link goes, in words: "Audience page", "Google Cloud Console". Never "click here".
   * The kit adds the ↗ after it.
   */
  readonly children: ReactNode;
  /** Only for an address from a request: a known address can't fail to arrive. */
  readonly onError?: never;
}

/** An `ExternalLink` whose address comes from a request, such as "Sign in with Google". */
interface ExternalLinkToRequestedAddress {
  /** Asks for the address. Called on each click; it must give an `http` or `https` address. */
  readonly href: () => Promise<string>;
  readonly children: ReactNode;
  /**
   * Called when the address didn't arrive, or isn't a web address. A tab opened for it is
   * already closed; show the error next to the link.
   */
  readonly onError: (error: unknown) => void;
}

export type ExternalLinkProps = ExternalLinkToAddress | ExternalLinkToRequestedAddress;

/** The inline link style: accent text, underlined on hover (base component specs, 17.1). */
const linkClasses = [
  "rounded-xs text-accent-text underline-offset-2 hover:underline focus-ring",
  "phone:inline-flex phone:min-h-touch phone:items-center",
].join(" ");

/**
 * A link to a page outside Studio, such as a Google Cloud Console page. Its text says where it
 * goes, followed by ↗, and screen readers also hear "opens in your browser". A click calls the
 * shell's `openExternal` service instead of navigating Studio itself.
 *
 * With an address known now, it's a real link, so "Copy link address" still works. With an
 * address that comes from a request, it's a button that looks the same: there's no address to
 * put on a link yet.
 *
 * @example
 * <ExternalLink href="https://console.cloud.google.com/auth/audience">Audience page</ExternalLink>
 * <ExternalLink href={() => startSignIn(account)} onError={showError}>Sign in with Google</ExternalLink>
 */
export function ExternalLink(props: ExternalLinkProps) {
  if (isRequestedAddress(props)) {
    return (
      <LinkToRequestedAddress href={props.href} onError={props.onError}>
        {props.children}
      </LinkToRequestedAddress>
    );
  }
  refuseNonWebAddress(props.href);
  return <LinkToAddress href={props.href}>{props.children}</LinkToAddress>;
}

function isRequestedAddress(props: ExternalLinkProps): props is ExternalLinkToRequestedAddress {
  return typeof props.href === "function";
}

function LinkToAddress({ href, children }: ExternalLinkToAddress) {
  const openExternal = useOpenExternal();

  function open(event: MouseEvent<HTMLAnchorElement>) {
    // Only a left or middle click opens the page; a right click shows the browser's menu.
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    event.preventDefault();
    // Doesn't reject for a known address: the shell reports its own errors (see OpenExternal).
    void openExternal(href);
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClasses}
      onClick={open}
      onAuxClick={open}
    >
      <LinkText>{children}</LinkText>
    </a>
  );
}

function LinkToRequestedAddress({ href, children, onError }: ExternalLinkToRequestedAddress) {
  const openExternal = useOpenExternal();
  // While the address is on its way, more clicks would open more tabs, so they're ignored. The
  // ref guards the clicks, the state shows aria-busy.
  const busy = useRef(false);
  const [opening, setOpening] = useState(false);

  function open() {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setOpening(true);
    // Not awaited before openExternal: a browser has to open its tab inside the click. Each call
    // runs inside a promise, so one that throws instead of rejecting still reaches onError.
    const address = new Promise<string>((resolve) => resolve(href())).then((url) => {
      refuseNonWebAddress(url);
      return url;
    });
    new Promise<void>((resolve) => resolve(openExternal(address))).catch(onError).finally(() => {
      busy.current = false;
      setOpening(false);
    });
  }

  return (
    <button type="button" className={linkClasses} aria-busy={opening} onClick={open}>
      <LinkText>{children}</LinkText>
    </button>
  );
}

function LinkText({ children }: { readonly children: ReactNode }) {
  return (
    <>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in your browser)</span>
    </>
  );
}

/**
 * A `javascript:` or `file:` address in a link would run code or open local files, so only web
 * addresses are allowed. Addresses are often built from what the user typed (a project ID).
 */
function refuseNonWebAddress(href: string): void {
  if (!isWebAddress(href)) {
    throw new TypeError(
      `ExternalLink opens web pages only, with an http or https address. It got "${href}".`,
    );
  }
}

// Not URL.parse(): the oldest webviews Studio supports don't have it (see README.md).
function isWebAddress(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
