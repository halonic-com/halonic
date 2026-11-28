import type { StepContext, StepOutcome } from "../runner.ts";

/** Where an Inbox row's title, meta line and its avatar's badge are, as XPaths. */
export interface InboxRowFitParts {
  /** The row's title, at most two 20px lines (`kit.plain-row-fit`). */
  readonly title: string;
  /** The line under the title, one 20px line in the Inbox (`inbox.row-meta-wraps`). */
  readonly meta: string;
  /** The badge at the avatar's bottom right, 20px on the 48px tile (`kit.avatar-badge`). */
  readonly badge: string;
}

/** The tallest title a 72px row holds: two 20px lines. */
const titleMaxPx = 40;
/** One line of the meta line's 14px text. */
const metaLinePx = 20;
/** The badge's side on a 48px tile. */
const badgePx = 20;

/** The height the app drew for the element, in px, or undefined when it isn't drawn. */
async function heightOf(context: StepContext, xpath: string): Promise<number | undefined> {
  // Reading a missing element throws, so the count comes first.
  if ((await context.driver.count(xpath)) === 0) return undefined;
  return Number.parseFloat(await context.driver.cssValue(xpath, "height"));
}

/**
 * Reads how an Inbox row fits its 72px (HAL-20759): its title takes at most two 20px lines
 * (`kit.plain-row-fit`), its meta line one (`inbox.row-meta-wraps`), and its avatar's badge is
 * 20px (`kit.avatar-badge`). The step reads the row's own 72px with `sidebarRowSize` first, and
 * calls this while the list shows. A missing badge fails as `NO_AVATAR_BADGE`, a badge of
 * another size as `AVATAR_BADGE_SIZE`, and a taller title or meta line as `PLAIN_ROW_FIT`.
 */
export async function inboxRowFit(
  context: StepContext,
  where: string,
  parts: InboxRowFitParts,
): Promise<StepOutcome> {
  const badge = await heightOf(context, parts.badge);
  if (badge === undefined) {
    return { passed: false, code: "NO_AVATAR_BADGE", note: `${where}: its avatar has no badge.` };
  }
  if (badge !== badgePx) {
    const note = `${where}: the avatar's badge is ${badge}px, not ${badgePx}px.`;
    return { passed: false, code: "AVATAR_BADGE_SIZE", note };
  }
  const title = (await heightOf(context, parts.title)) ?? 0;
  const meta = (await heightOf(context, parts.meta)) ?? 0;
  if (title <= titleMaxPx && meta <= metaLinePx) return { passed: true };
  return {
    passed: false,
    code: "PLAIN_ROW_FIT",
    note: `${where}: the title takes ${title}px and the meta line ${meta}px, not at most ${titleMaxPx}px and ${metaLinePx}px.`,
  };
}
