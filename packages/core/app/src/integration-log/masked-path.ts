// Masking a request's path before the local request log keeps it (HAL-18391
// plan, section 2.2). A fix needs the route's shape, not the order number or
// a customer's address in it, so a segment is kept only when the
// integration's own code holds it. The caller passes the code as it is when
// the entry is written, so a later change to the code never unmasks an entry.
//
// The integration chooses its paths, so the masking's cost is bounded
// (Julian, HAL-19169): the code's words are looked up in sets built once per
// code read, a path has at most `maxSegments` segments looked at, and the
// scan for any other segment stops after `maxOccurrences` matches. One write
// masks many paths, so it also has `maxScansPerWrite` scans in all, and
// remembers each segment's answer (Julian, HAL-19291). Every limit masks
// more, never less.

/** What a masked path segment is stored as. */
export const maskedSegment = "{…}";

/** The most segments of a path the masking looks at; the rest become one {@link maskedSegment}. */
export const maxSegments = 64;
/** A longer segment that isn't a plain word is masked without a scan: no route has one. */
const maxScannedLength = 200;
/** How many matches of a segment that isn't a plain word are looked at before it is masked. */
const maxOccurrences = 100;
/** How many segments that aren't plain words one write scans the code for; past it, they are masked. */
export const maxScansPerWrite = 64;

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
 * {@link maskedSegment}. One path gets a {@link PathMasking} of its own; a
 * write of many paths shares one, so its scans stay bounded.
 *
 * @example
 * maskedPath("/v2/orders/1001", codeIndex("get(`/v2/orders/${id}`)")); // "/v2/orders/{…}"
 */
export function maskedPath(path: string, code: CodeIndex): string {
  return new PathMasking(code).path(path);
}

/**
 * The masking of every path one write keeps, against one code read. A segment
 * that isn't a plain word needs a scan of the code; the write makes at most
 * `scans` of them and masks each such segment after that. Each segment's
 * answer is remembered, so a flood of the same path costs one scan.
 */
export class PathMasking {
  readonly #code: CodeIndex;
  readonly #scanned = new Map<string, boolean>();
  #scansLeft: number;

  /** @param scans - how many segments the write may scan the code for; {@link maxScansPerWrite} by default */
  constructor(code: CodeIndex, scans = maxScansPerWrite) {
    this.#code = code;
    this.#scansLeft = scans;
  }

  /** The path with every segment the code doesn't hold masked, as {@link maskedPath} says. */
  path(path: string): string {
    const segments = path.split("/");
    const kept = segments
      .slice(0, maxSegments)
      .map((segment) => (segment === "" || this.#inCode(segment) ? segment : maskedSegment));
    return [...kept, ...(segments.length > maxSegments ? [maskedSegment] : [])].join("/");
  }

  #inCode(segment: string): boolean {
    const code = this.#code;
    if (/^[0-9]+$/.test(segment)) return code.routeDigits.has(segment);
    if (/^[A-Za-z0-9_]+$/.test(segment)) return code.words.has(segment);
    if (segment.length > maxScannedLength) return false;
    const known = this.#scanned.get(segment);
    if (known !== undefined) return known;
    if (this.#scansLeft === 0) return false;
    this.#scansLeft -= 1;
    const found = scanned(segment, code.code);
    this.#scanned.set(segment, found);
    return found;
  }
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
