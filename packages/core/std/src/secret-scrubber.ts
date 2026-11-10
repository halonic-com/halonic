import { isPlainObject } from "./plain-data.ts";

/** What a secret value is replaced with wherever a scrubber finds it. */
export const secretRemoved = "[secret removed]";

/**
 * The forms one secret commonly takes in text: as it is, URL-encoded (with
 * upper- and lowercase escapes), form-encoded, and JSON-escaped (with `/`
 * as it is and as `\/`). Base64, reversed, split or otherwise transformed
 * copies are not here: those can't be found by matching text.
 *
 * Not covered either: JSON that escapes non-ASCII as `\uXXXX` (Python's
 * default `json.dumps`), form-encoding with lowercase escapes, and
 * URL-encoding that mixes upper- and lowercase escapes (`%2f%2F`).
 *
 * The forms come in the order shown, which stays the same. They can
 * repeat, for example when the value has nothing to encode. An empty value
 * has no forms, because an empty match is everywhere.
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
 * each form {@link secretTextForms} lists. It finds every copy of every form
 * in the text as given, so copies that touch or overlap become one
 * `[secret removed]` and no part of either secret is left, and a short
 * secret is never found inside a marker the scrubber wrote itself.
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

  /** Adds a secret to scrub from now on. An empty value is ignored. */
  remember(value: string): void {
    for (const form of secretTextForms(value)) this.#forms.add(form);
  }

  /** The text with every form of every remembered secret replaced. */
  scrub(text: string): string {
    const hidden = this.#hiddenCharacters(text);
    let scrubbed = "";
    let at = 0;
    while (at < text.length) {
      if (!hidden[at]) {
        scrubbed += text[at];
        at += 1;
        continue;
      }
      scrubbed += secretRemoved;
      while (at < text.length && hidden[at]) at += 1;
    }
    return scrubbed;
  }

  /**
   * A copy of JSON-shaped data with {@link scrub} applied to every string in
   * it, object keys included, at any depth. Numbers, booleans, `null` and
   * anything that isn't a string, an array or a plain object are kept as
   * they are. The value given is not changed.
   *
   * @example
   * scrubber.scrubValue({ headers: [`Bearer ${token}`] }); // { headers: ["Bearer [secret removed]"] }
   */
  scrubValue(value: unknown): unknown {
    if (typeof value === "string") return this.scrub(value);
    if (Array.isArray(value)) return value.map((item) => this.scrubValue(item));
    if (!isPlainObject(value)) return value;
    const scrubbed: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      scrubbed[this.scrub(key)] = this.scrubValue(item);
    }
    return scrubbed;
  }

  /**
   * One flag per UTF-16 code unit of the text, set where any copy of any
   * form covers it. Copies of one form may overlap (`aa` in `aaa`), so the
   * search moves on one code unit at a time, not past the whole copy.
   */
  #hiddenCharacters(text: string): Uint8Array {
    const hidden = new Uint8Array(text.length);
    for (const form of this.#forms) {
      for (let at = text.indexOf(form); at !== -1; at = text.indexOf(form, at + 1)) {
        hidden.fill(1, at, at + form.length);
      }
    }
    return hidden;
  }
}
