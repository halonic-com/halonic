import type { MouseEvent, ReactNode } from "react";
import { useOpenExternal } from "./open-external.tsx";

export interface ExternalLinkProps {
  /** The page to open: an `http` or `https` address. Anything else throws. */
  readonly href: string;
  /**
   * Where the link goes, in words: "Audience page", "Google Cloud Console". Never "click here".
   * The kit adds the ↗ after it.
   */
  readonly children: ReactNode;
}

/** The inline link style: accent text, underlined on hover (base component specs, 17.1). */
const linkClasses = [
  "rounded-xs text-accent-text underline-offset-2 hover:underline focus-ring",
  "phone:inline-flex phone:min-h-touch phone:items-center",
].join(" ");

/**
 * A link to a page outside Studio, such as a Google Cloud Console page. Its text says where it
 * goes, followed by ↗, and screen readers also hear "opens in your browser". A click calls the
 * shell's `openExternal` service instead of navigating Studio itself; the address stays on the
 * link, so "Copy link address" still works.
 *
 * @example
 * <ExternalLink href="https://console.cloud.google.com/auth/audience">Audience page</ExternalLink>
 */
export function ExternalLink({ href, children }: ExternalLinkProps) {
  refuseNonWebAddress(href);
  const openExternal = useOpenExternal();

  function open(event: MouseEvent<HTMLAnchorElement>) {
    // Only a left or middle click opens the page; a right click shows the browser's menu.
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    event.preventDefault();
    openExternal(href);
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
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in your browser)</span>
    </a>
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
