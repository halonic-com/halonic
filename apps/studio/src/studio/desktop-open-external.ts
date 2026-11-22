import type { ExternalAddress, OpenExternal } from "@halonicjs/studio-kit";

/** The kinds of address the system opens: a web page in the browser, an email address in mail. */
const outsideSchemes = new Set(["http:", "https:", "mailto:"]);

/** The part of the page's location the desktop opener uses: its origin, and how to ask for another page. */
type PageLocation = Pick<Location, "origin" | "assign">;

/**
 * The desktop app's `openExternal` (`kit.external-link`). The app's window opens no new windows,
 * so a new tab would go nowhere. Instead it asks for the page in the window itself, and the
 * shell's navigation guard (`navigation.rs`, flow-install-update 5.4) cancels that and hands
 * every outside web page to the system browser, as it does for a link the person clicks. The
 * Studio stays as it was.
 *
 * It opens nothing for an address on the app's own origin, which the guard would load in the
 * window, or one that isn't a web page or an email address, which the guard would drop; it
 * reports those to `report`, since a link has nobody to tell.
 *
 * @param page - the page's global object, whose `location` it uses
 * @returns the opener, or `undefined` for a page without a location, which keeps the kit's own
 * @throws (the promise rejects) only when a pending address doesn't arrive
 */
export function desktopOpenExternal(
  page: object,
  report: (error: Error) => void = (error) => console.error("An outside link", error),
): OpenExternal | undefined {
  const location = locationOf(page);
  if (location === undefined) return undefined;
  return async (address: ExternalAddress) => {
    const text = await address;
    const url = parsed(text);
    if (url === undefined || !opensOutside(url, location.origin)) {
      report(
        new Error(`Halonic opens only web pages and email addresses outside the app: ${text}`),
      );
      return;
    }
    location.assign(url.href);
  };
}

/** The page's `location`, when it has one that can go to another page. */
function locationOf(page: object): PageLocation | undefined {
  const location: unknown = "location" in page ? page.location : undefined;
  if (typeof location !== "object" || location === null) return undefined;
  if (!("assign" in location) || typeof location.assign !== "function") return undefined;
  if (!("origin" in location) || typeof location.origin !== "string") return undefined;
  return location as PageLocation;
}

/** Whether the system opens `url` outside the app: a web page elsewhere, or an email address. */
function opensOutside(url: URL, appOrigin: string): boolean {
  if (!outsideSchemes.has(url.protocol)) return false;
  return url.protocol === "mailto:" || url.origin !== appOrigin;
}

/** The address as a URL, or `undefined`; `new URL` because Studio's oldest webviews have no `URL.parse` or `URL.canParse`. */
function parsed(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}
