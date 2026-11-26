import { type GatewayHostMessage, gatewayMaxMessageBytes } from "@halonicjs/ports";

const encoder = new TextEncoder();

/** A `msg-data` or `team-data` answer, before it is cut into a page. */
export type GatewayPage = Extract<GatewayHostMessage, { type: "msg-data" | "team-data" }>;

/**
 * The JSON of the longest first page of `page.items` that fits in one
 * message, or `undefined` when not even its first item fits. When items are
 * left, the page carries `more`, the cursor `cursorAt` makes for the index of
 * the first item left out; the phone hands it back to read on. No caller sets
 * `page.more` yet: a provider's own cursor would need `sendPage` and `isCursor`
 * to accept it first.
 */
export function fitPage(
  page: GatewayPage,
  cursorAt: (firstLeftOut: number) => string,
): string | undefined {
  const { items } = page;
  const pageOf = (count: number) =>
    JSON.stringify({
      ...page,
      items: items.slice(0, count),
      more: count < items.length ? cursorAt(count) : page.more,
    });
  const whole = pageOf(items.length);
  if (sizeOf(whole) <= gatewayMaxMessageBytes) return whole;
  // The most items that fit, by bisection: the size grows with the count.
  let fits = 0;
  let tooMany = items.length;
  while (tooMany - fits > 1) {
    const middle = Math.floor((fits + tooMany) / 2);
    if (sizeOf(pageOf(middle)) <= gatewayMaxMessageBytes) fits = middle;
    else tooMany = middle;
  }
  return fits === 0 ? undefined : pageOf(fits);
}

function sizeOf(json: string): number {
  return encoder.encode(json).byteLength;
}
