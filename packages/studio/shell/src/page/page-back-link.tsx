import { BackIcon } from "@halonicjs/studio-kit";
import type { Announcer } from "../announcer/announcer.ts";
import { LocationLink } from "../tabs/location-link.tsx";
import { openLocation } from "../tabs/open-location.ts";
import type { TabLocation, TabSet } from "../tabs/tab-set.ts";

/** Props for {@link PageBackLink}. */
export interface PageBackLinkProps {
  /** The place above the page, such as Workflows for the workflow "Support reply". */
  readonly parent: TabLocation;
  readonly tabs: TabSet;
  /** For "Opened … in a new tab." after a Ctrl-click. */
  readonly announcer: Announcer;
}

/**
 * The small link above a page's title that goes one level up, "← Workflows" (design decision
 * HAL-8433, `shell.page-back-link`). It is a real link, so Ctrl-click, a middle-click and "open in
 * new tab" keep working: a click opens the parent in this tab, a Ctrl-click in a new tab next to
 * it. There's one level only, never a trail.
 *
 * @example
 * <PageBackLink parent={{ key: "workflows", title: "Workflows" }} tabs={tabs} announcer={announcer} />
 */
export function PageBackLink({ parent, tabs, announcer }: PageBackLinkProps) {
  return (
    <nav aria-label="Back" className="px-4 pt-3">
      <LocationLink
        location={parent}
        onOpen={(location, inNewTab) => openLocation(tabs, announcer, location, inNewTab)}
        label={`Back to ${parent.title}`}
        className={linkClasses}
      >
        <span aria-hidden="true" className="inline-grid size-icon-sm shrink-0 *:size-full">
          <BackIcon />
        </span>
        {parent.title}
      </LocationLink>
    </nav>
  );
}

const linkClasses =
  "inline-flex items-center gap-1 rounded-xs text-small text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-ring";
