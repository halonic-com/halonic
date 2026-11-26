// Masking a request's path before the local request log keeps it (HAL-18391
// plan, section 2.2). A fix needs the route's shape, not the order number or
// a customer's address in it, so a segment is kept only when the
// integration's own code holds it. The caller passes the code as it is when
// the entry is written, so a later change to the code never unmasks an entry.
//
// A runner can send refused requests in a tight loop, so the cost is bounded
// (Julian, HAL-19170): the code's words go into sets once per code read, and
// a segment that isn't a word is looked for only up to a cap.

/** What a masked path segment is stored as. */
export const maskedSegment = "{…}";

/** How many segments of a path are looked at; later ones are masked. */
const maxSegments = 64;
/** The longest segment that isn't a word the code is searched for. */
const maxSearchedLength = 200;
/** How many places in the code a segment that isn't a word is checked at. */
const maxMatches = 100;

const wordOnly = /^[A-Za-z0-9_]+$/;
const digitsOnly = /^[0-9]+$/;
/** Each whole run of word characters in the code. */
const wordRun = /[A-Za-z0-9_]+/g;

/**
 * Masks paths against one read of the integration's code. A segment of
 * letters is kept when the code holds it as a whole word, such as `orders`
 * in `` `/v2/orders/${id}` ``. A segment of digits only looks like an id, so
 * it is kept only when the code holds it right after a `/`, as a route does
 * (`/api/3/`); `1001` in `limit = 1001` doesn't count. Any other segment,
 * such as `orders.json`, is kept when the code holds it with no word
 * character on either side.
 *
 * Only the first 64 segments are looked at. A segment that isn't a word is
 * masked when it is longer than 200 characters, or when none of the first
 * 100 places the code holds it at counts. Masking more is always safe.
 */
export class PathMasker {
  readonly #code: string;
  /** Every whole word in the code that isn't only digits. */
  readonly #words = new Set<string>();
  /** Every whole run of digits in the code that comes right after a `/`. */
  readonly #routeNumbers = new Set<string>();

  constructor(code: string) {
    this.#code = code;
    for (const match of code.matchAll(wordRun)) {
      const word = match[0];
      if (!digitsOnly.test(word)) {
        this.#words.add(word);
      } else if (code[match.index - 1] === "/") {
        this.#routeNumbers.add(word);
      }
    }
  }

  /**
   * The path with every segment the code doesn't hold replaced by
   * {@link maskedSegment}.
   *
   * @example
   * new PathMasker("get(`/v2/orders/${id}`)").masked("/v2/orders/1001"); // "/v2/orders/{…}"
   */
  masked(path: string): string {
    // Index 0 is the empty text before the leading `/`.
    return path
      .split("/")
      .map((segment, index) =>
        segment === "" || (index <= maxSegments && this.#holds(segment)) ? segment : maskedSegment,
      )
      .join("/");
  }

  #holds(segment: string): boolean {
    if (digitsOnly.test(segment)) return this.#routeNumbers.has(segment);
    if (wordOnly.test(segment)) return this.#words.has(segment);
    return segment.length <= maxSearchedLength && this.#searched(segment);
  }

  /** Whether the code holds `segment` with no word character on either side, within the cap. */
  #searched(segment: string): boolean {
    const code = this.#code;
    let at = code.indexOf(segment);
    for (let checked = 0; at !== -1 && checked < maxMatches; checked += 1) {
      const before = code[at - 1];
      const after = code[at + segment.length];
      if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
      at = code.indexOf(segment, at + 1);
    }
    return false;
  }
}

/**
 * The path masked against `code`, as {@link PathMasker} does. To mask many
 * paths against one read of the code, make one `PathMasker`.
 *
 * @example
 * maskedPath("/v2/orders/1001", "get(`/v2/orders/${id}`)"); // "/v2/orders/{…}"
 */
export function maskedPath(path: string, code: string): string {
  return new PathMasker(code).masked(path);
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && wordOnly.test(character);
}
