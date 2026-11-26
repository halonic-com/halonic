// Masking a request's path before the local request log keeps it (HAL-18391
// plan, section 2.2). A fix needs the route's shape, not the order number or
// a customer's address in it, so a segment is kept only when the
// integration's own code holds it. The caller passes the code as it is when
// the entry is written, so a later change to the code never unmasks an entry.
//
// The integration chooses its paths, so the masking's cost is bounded
// (Julian, HAL-19169): the code's words are looked up in sets built once per
// code read, a path has at most `maxSegments` segments looked at, and the
// scan for any other segment stops after `maxOccurrences` matches. Every
// limit masks more, never less.

/** What a masked path segment is stored as. */
export const maskedSegment = "{…}";

/** The most segments of a path the masking looks at; the rest become one {@link maskedSegment}. */
export const maxSegments = 64;
/** A longer segment that isn't a plain word is masked without a scan: no route has one. */
const maxScannedLength = 200;
/** How many matches of a segment that isn't a plain word are looked at before it is masked. */
const maxOccurrences = 100;

/** The integration's code, read for masking: built once per code read by {@link codeIndex}. */
export interface CodeIndex {
  readonly code: string;
  /** Every run of word characters in the code, such as `orders` and `v2`. */
  readonly words: ReadonlySet<string>;
  /** Every run of digits right after a `/`, as a route has it (`/api/3/`). */
  readonly routeDigits: ReadonlySet<string>;
}

/** The {@link CodeIndex} of `code`, for every path masked against it. */
export function codeIndex(code: string): CodeIndex {
  const words = new Set<string>();
  const routeDigits = new Set<string>();
  for (const match of code.matchAll(/[A-Za-z0-9_]+/g)) {
    words.add(match[0]);
    if (/^[0-9]+$/.test(match[0]) && code[match.index - 1] === "/") routeDigits.add(match[0]);
  }
  return { code, words, routeDigits };
}

/**
 * The path with every segment the integration's code doesn't hold replaced
 * by {@link maskedSegment}. A segment of letters is kept when the code holds
 * it as a whole word, such as `orders` in `` `/v2/orders/${id}` ``. A segment
 * of digits only looks like an id, so it is kept only when the code holds it
 * right after a `/`, as a route does (`/api/3/`); `1001` in `limit = 1001`
 * doesn't count. Segments past the first {@link maxSegments} become one
 * {@link maskedSegment}.
 *
 * @example
 * maskedPath("/v2/orders/1001", codeIndex("get(`/v2/orders/${id}`)")); // "/v2/orders/{…}"
 */
export function maskedPath(path: string, code: CodeIndex): string {
  const segments = path.split("/");
  const kept = segments
    .slice(0, maxSegments)
    .map((segment) => (segment === "" || inCode(segment, code) ? segment : maskedSegment));
  return [...kept, ...(segments.length > maxSegments ? [maskedSegment] : [])].join("/");
}

function inCode(segment: string, code: CodeIndex): boolean {
  if (/^[0-9]+$/.test(segment)) return code.routeDigits.has(segment);
  if (/^[A-Za-z0-9_]+$/.test(segment)) return code.words.has(segment);
  return segment.length <= maxScannedLength && scanned(segment, code.code);
}

/** Whether `code` holds `segment` outside a longer word, within its first matches. */
function scanned(segment: string, code: string): boolean {
  let at = code.indexOf(segment);
  for (let looked = 0; at !== -1 && looked < maxOccurrences; looked += 1) {
    if (!isWordCharacter(code[at - 1]) && !isWordCharacter(code[at + segment.length])) return true;
    at = code.indexOf(segment, at + 1);
  }
  return false;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}
