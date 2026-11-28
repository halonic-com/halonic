import type { StepContext, StepOutcome } from "../runner.ts";

/** Where an Inbox row's title, meta line and its avatar's badge are, as XPaths. */
export interface InboxRowFitParts {
  /** The row's title, clamped to two 20px lines (`kit.plain-row-fit`). */
  readonly title: string;
  /** The line under the title, cut on one line in the Inbox (`inbox.row-meta-wraps`). */
  readonly meta: string;
  /** The badge at the avatar's bottom right, 20px on the 48px tile (`kit.avatar-badge`). */
  readonly badge: string;
}

/** The badge's side on a 48px tile. */
const badgePx = "20px";

/**
 * Where the meta line's cut is: on the line itself, or, when the line ends in a `metaEnd` that
 * stays whole, on the text before it, the line's first child.
 */
async function metaCut(context: StepContext, meta: string): Promise<string> {
  const endsWhole = (await context.driver.count(`${meta}/*[@data-part='meta-end']`)) > 0;
  return endsWhole ? `${meta}/*[1]` : meta;
}

/** Why the title or meta line breaks its promise, or undefined when both keep it. */
async function lineFitFault(
  context: StepContext,
  parts: InboxRowFitParts,
): Promise<string | undefined> {
  const clamp = await context.driver.cssValue(parts.title, "-webkit-line-clamp");
  const lineHeight = await context.driver.cssValue(parts.title, "line-height");
  if (clamp !== "2" || lineHeight !== "20px") {
    return `the title is clamped to ${clamp || "no"} lines of ${lineHeight}, not 2 of 20px`;
  }
  const cut = await metaCut(context, parts.meta);
  const whiteSpace = await context.driver.cssValue(cut, "white-space");
  const overflow = await context.driver.cssValue(cut, "text-overflow");
  if (whiteSpace !== "nowrap" || overflow !== "ellipsis") {
    const read = `white-space ${whiteSpace} and text-overflow ${overflow}`;
    return `the meta line has ${read}, not nowrap and ellipsis`;
  }
  return undefined;
}

/**
 * Reads how an Inbox row fits its 72px (HAL-20759) from the computed values that make the promise,
 * so a short title still shows a broken clamp: the title clamped to two 20px lines
 * (`kit.plain-row-fit`), the meta line cut on one (`inbox.row-meta-wraps`), and the avatar's badge
 * 20px (`kit.avatar-badge`). The step reads the row's own 72px with `sidebarRowSize` first and
 * calls this while the list shows. A title or meta line it can't find fails as `NO_ROW_PART`, a
 * missing badge as `NO_AVATAR_BADGE`, a badge of another size as `AVATAR_BADGE_SIZE`, and a title
 * or meta line that can grow as `PLAIN_ROW_FIT`.
 */
export async function inboxRowFit(
  context: StepContext,
  where: string,
  parts: InboxRowFitParts,
): Promise<StepOutcome> {
  // Reading a missing element throws, so each part is counted first.
  for (const [name, xpath] of [
    ["title", parts.title],
    ["meta line", parts.meta],
  ] as const) {
    if ((await context.driver.count(xpath)) === 0) {
      return { passed: false, code: "NO_ROW_PART", note: `${where}: no ${name} at ${xpath}.` };
    }
  }
  if ((await context.driver.count(parts.badge)) === 0) {
    return { passed: false, code: "NO_AVATAR_BADGE", note: `${where}: its avatar has no badge.` };
  }
  const badge = await context.driver.cssValue(parts.badge, "height");
  if (badge !== badgePx) {
    const note = `${where}: the avatar's badge is ${badge}, not ${badgePx}.`;
    return { passed: false, code: "AVATAR_BADGE_SIZE", note };
  }
  const fault = await lineFitFault(context, parts);
  if (fault === undefined) return { passed: true };
  return { passed: false, code: "PLAIN_ROW_FIT", note: `${where}: ${fault}.` };
}
