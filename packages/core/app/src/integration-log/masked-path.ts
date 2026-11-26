// Masking a request's path before the local request log keeps it (HAL-18391
// plan, section 2.2). A fix needs the route's shape, not the order number or
// a customer's address in it, so a segment is kept only when the
// integration's own code holds it. The caller passes the code as it is when
// the entry is written, so a later change to the code never unmasks an entry.

/** What a masked path segment is stored as. */
export const maskedSegment = "{…}";

/**
 * The path with every segment the integration's code doesn't hold replaced
 * by {@link maskedSegment}. A segment of letters is kept when the code holds
 * it as a whole word, such as `orders` in `` `/v2/orders/${id}` ``. A segment
 * of digits only looks like an id, so it is kept only when the code holds it
 * right after a `/`, as a route does (`/api/3/`); `1001` in `limit = 1001`
 * doesn't count.
 *
 * @example
 * maskedPath("/v2/orders/1001", "get(`/v2/orders/${id}`)"); // "/v2/orders/{…}"
 */
export function maskedPath(path: string, code: string): string {
  return path
    .split("/")
    .map((segment) => (segment === "" || inCode(segment, code) ? segment : maskedSegment))
    .join("/");
}

function inCode(segment: string, code: string): boolean {
  const digitsOnly = /^[0-9]+$/.test(segment);
  for (let at = code.indexOf(segment); at !== -1; at = code.indexOf(segment, at + 1)) {
    const before = code[at - 1];
    const after = code[at + segment.length];
    if (isWordCharacter(before) || isWordCharacter(after)) continue;
    if (!digitsOnly || before === "/") return true;
  }
  return false;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}
