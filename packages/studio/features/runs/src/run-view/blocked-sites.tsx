import type { StepBlockedSites } from "@halonicjs/events";
import { ChevronRightIcon, inlineLinkClasses, WarningIcon } from "@halonicjs/studio-kit";
import type { Ref } from "react";
import { fill, fillText, SiteNameText, stepSummaryText, triesText } from "./blocked-sites-text.tsx";

/** How many sites a step's entry lists (sandbox-screens 2.2); `blockedSites(events, { limit })`. */
export const entrySiteLimit = 5;
/** How many sites the run log view lists per step (sandbox-screens 2.2). */
export const logSiteLimit = 20;

/** The props of {@link BlockedSitesLine}. */
export interface BlockedSitesLineProps {
  readonly step: StepBlockedSites;
  /** Whether the step's entry is open. */
  readonly expanded: boolean;
  /** Opens the step's entry with focus on the Blocked sites heading. */
  readonly onOpen: () => void;
}

/**
 * "Blocked 3 sites" under a step's meta line, in warning tone, never danger: a blocked site isn't
 * always why a step failed. A button named by its text (`runs.run-view.blocked-sites`).
 */
export function BlockedSitesLine({ step, expanded, onOpen }: BlockedSitesLineProps) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 rounded-xs text-small font-medium text-warning focus-ring [&>svg]:size-4"
    >
      <WarningIcon />
      {stepSummaryText(step.sites.length + step.moreSites)}
    </button>
  );
}

/** The props of {@link BlockedSitesPanel}. */
export interface BlockedSitesPanelProps {
  /** The step's blocked sites, from `blockedSites(events, { limit: entrySiteLimit })`. */
  readonly step: StepBlockedSites;
  /** The agent's name as the person sees it: "Writer". */
  readonly agent: string;
  /**
   * Whether the hint may say "No connection was made.". False for a run on Windows until the
   * blocked-site suite runs green there (Julian, HAL-6208; HAL-6219).
   */
  readonly noConnectionProven: boolean;
  /** On a phone the action is a line naming where to fix it, with no link. */
  readonly place: "desktop" | "phone";
  /** Opens the agent at Configuration › Harness with focus on the allowed sites field. Desktop only. */
  readonly onOpenAllowedSites?: () => void;
  /** Takes focus when the "Blocked 3 sites" line opened the entry. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The Blocked sites panel of a step's open entry (sandbox-screens 2.2): one row per site with its
 * tries, at most {@link entrySiteLimit}, then "and 7 more sites" (not a link), the hint, and one
 * action. Nothing here writes to the agent's file: the person adds a site themselves.
 */
export function BlockedSitesPanel(props: BlockedSitesPanelProps) {
  const { step, agent } = props;
  const many = step.sites.length + step.moreSites > 1 ? "many" : "one";
  const hint = [
    fillText(`sandbox.blocked-sites.hint.why.${many}`, { agent }),
    props.noConnectionProven ? fillText("sandbox.blocked-sites.no-connection") : null,
    fillText(`sandbox.blocked-sites.hint.allow.${many}`, { agent }),
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");
  return (
    <section className="flex flex-col gap-2 rounded-sm bg-surface-subtle p-3">
      <h3 ref={props.headingRef} tabIndex={-1} className="text-body-strong outline-none">
        {fill("sandbox.blocked-sites.title")}
      </h3>
      <ul className="divide-y divide-border">
        {step.sites.map((site) => (
          <li key={site.host} className="flex justify-between gap-4 py-1 text-body">
            {/* A 64-character name is wider than a phone: it wraps, the count stays whole. */}
            <span className="min-w-0 break-all">
              <SiteNameText host={site.host} />
            </span>
            <span className="sr-only">, </span>
            <span className="shrink-0 text-fg-muted">{triesText(site.tries)}</span>
          </li>
        ))}
      </ul>
      {step.moreSites > 0 ? <p className="text-small text-fg-muted">{moreText(step)}</p> : null}
      <p className="text-small text-fg-muted">{hint}</p>
      <Action {...props} />
    </section>
  );
}

function Action({ agent, place, onOpenAllowedSites }: BlockedSitesPanelProps) {
  if (place === "phone" || onOpenAllowedSites === undefined) {
    return (
      <p className="text-small text-fg-muted">
        {fill("sandbox.blocked-sites.phone-fix", { agent })}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpenAllowedSites}
      className={`inline-flex items-center gap-0.5 self-start text-small ${inlineLinkClasses} [&>svg]:size-4`}
    >
      {fill("sandbox.blocked-sites.action", { agent })}
      <ChevronRightIcon />
    </button>
  );
}

function moreText(step: StepBlockedSites) {
  return step.moreSites === 1
    ? fill("sandbox.blocked-sites.more.one")
    : fill("sandbox.blocked-sites.more.many", { count: step.moreSites });
}

/**
 * A step's lines in the run log view, at the place of its first blocked site (`step.firstSeq`):
 * "Blocked: registry.npmjs.org (12 tries)" once per site, at most {@link logSiteLimit}, then
 * "and 3 more sites". The full list stays in the run log file.
 */
export function BlockedSitesLogLines({ step }: { readonly step: StepBlockedSites }) {
  return (
    <>
      {step.sites.map((site) => (
        <p key={site.host} className="text-small text-fg">
          {fill("sandbox.blocked-sites.log-line", {
            site: <SiteNameText host={site.host} />,
            tries: triesText(site.tries),
          })}
        </p>
      ))}
      {step.moreSites > 0 ? (
        <p className="text-small text-fg-muted">
          {step.moreSites === 1
            ? fill("sandbox.blocked-sites.log-more.one")
            : fill("sandbox.blocked-sites.log-more.many", { count: step.moreSites })}
        </p>
      ) : null}
    </>
  );
}

/** The props of {@link BlockedSitesBannerText}. */
export interface BlockedSitesBannerTextProps {
  /** The failed step's blocked sites; the first, with the most tries, is the example. */
  readonly step: StepBlockedSites;
  /** The agent's name: "Reporter". */
  readonly agent: string;
  /** As on {@link BlockedSitesPanelProps.noConnectionProven}. */
  readonly noConnectionProven: boolean;
}

/**
 * The failed banner's sentence for a run stopped by several blocked sites (reason `blocked`,
 * microcopy 23.2), with one example domain. One site keeps 15.3's sentence, so this returns null
 * for it. The banner's action is `sandbox.blocked-sites.banner-action`, "See the step".
 */
export function BlockedSitesBannerText({
  step,
  agent,
  noConnectionProven,
}: BlockedSitesBannerTextProps) {
  const count = step.sites.length + step.moreSites;
  const example = step.sites[0];
  if (count < 2 || example === undefined) return null;
  return (
    <>
      {fill("sandbox.blocked-sites.banner-many", {
        agent,
        count,
        site: <SiteNameText host={example.host} />,
      })}
      {noConnectionProven ? ` ${fillText("sandbox.blocked-sites.no-connection")}` : null}
    </>
  );
}

/** "See the step", the failed banner's one action for a `blocked` run. */
export function seeTheStepText(): string {
  return fillText("sandbox.blocked-sites.banner-action");
}
