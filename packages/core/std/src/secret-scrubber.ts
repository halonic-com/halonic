/** What a secret value is replaced with wherever a scrubber finds it. */
export const secretRemoved = "[secret removed]";

/**
 * The forms one secret commonly takes in text: as it is, URL-encoded (with
 * upper- and lowercase escapes), form-encoded, and JSON-escaped (with `/`
 * as it is and as `\/`). Base64, reversed, split or otherwise transformed
 * copies are not here: those can't be found by matching text.
 *
 * The forms can repeat, for example when the value has nothing to encode.
 * An empty value has no forms, because an empty match is everywhere.
 *
 * @example
 * secretTextForms("a b"); // ["a b", "a%20b", "a%20b", "a+b", "a b", "a b"]
 */
export function secretTextForms(value: string): string[] {
  if (value === "") return [];
  // `encodeURIComponent` throws on a lone surrogate; the URL and form
  // encoders of the web platform write it as U+FFFD, so do the same.
  const urlEncoded = encodeURIComponent(value.toWellFormed());
  const json = JSON.stringify(value).slice(1, -1);
  return [
    value,
    urlEncoded,
    urlEncoded.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()),
    formEncoded(urlEncoded),
    json,
    json.replaceAll("/", "\\/"),
  ];
}

/**
 * The value as `application/x-www-form-urlencoded` writes it, as
 * `URLSearchParams` does, built from its URL-encoded form: a space becomes
 * `+`, and `!'()~`, which `encodeURIComponent` leaves alone, are escaped.
 */
function formEncoded(urlEncoded: string): string {
  return urlEncoded
    .replaceAll("%20", "+")
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Replaces every secret it has been told about with `[secret removed]`, in
 * each form {@link secretTextForms} lists. Longer forms go first, so when
 * one secret contains another, the longer one is removed whole.
 *
 * Every non-empty secret is matched, however short: a one-letter secret
 * mangles the text, but leaking it would be worse. Scrub a whole text
 * before splitting it into lines, so a secret that holds a line break is
 * still found.
 *
 * @example
 * const scrubber = new SecretScrubber();
 * scrubber.remember(apiKey);
 * scrubber.scrub(`GET /v1?key=${apiKey} failed`); // "GET /v1?key=[secret removed] failed"
 */
export class SecretScrubber {
  readonly #forms = new Set<string>();
  /**
   * The forms, longest first, rebuilt only when a secret is added. Each is
   * replaced in a pass of its own, so when two secrets overlap without one
   * containing the other, the longer is removed whole and the shorter is
   * still found in what is left.
   */
  #longestFirst: readonly string[] = [];

  /** Adds a secret to scrub from now on. An empty value is ignored. */
  remember(value: string): void {
    const sizeBefore = this.#forms.size;
    for (const form of secretTextForms(value)) this.#forms.add(form);
    if (this.#forms.size === sizeBefore) return;
    this.#longestFirst = [...this.#forms].sort((a, b) => b.length - a.length);
  }

  /** The text with every form of every remembered secret replaced. */
  scrub(text: string): string {
    let scrubbed = text;
    for (const form of this.#longestFirst) scrubbed = scrubbed.replaceAll(form, secretRemoved);
    return scrubbed;
  }
}
