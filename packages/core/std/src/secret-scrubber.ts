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
   * they are. The value given is not changed. A `__proto__` key stays a key
   * of the copy, and deep data doesn't overflow the call stack: the copy
   * keeps its own list of what is left to copy instead of recursing.
   *
   * @example
   * scrubber.scrubValue({ headers: [`Bearer ${token}`] }); // { headers: ["Bearer [secret removed]"] }
   */
  scrubValue(value: unknown): unknown {
    const root: { copy?: unknown } = {};
    const pending: PendingCopy[] = [
      {
        value,
        put: (copy) => {
          root.copy = copy;
        },
      },
    ];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      const items = this.#copyOne(next);
      // From the last, so the first comes off the stack first; a loop, as
      // spreading a very long list into `push` overflows the stack.
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (item !== undefined) pending.push(item);
      }
    }
    return root.copy;
  }

  /**
   * Copies one value: a string scrubbed, anything else that isn't an array or
   * a plain object as it is. An array or object is put in place empty, and
   * its items come back as copies still to make, in order, so a later key
   * that scrubs to the same text as an earlier one still wins.
   */
  #copyOne({ value, put }: PendingCopy): PendingCopy[] {
    if (typeof value === "string") {
      put(this.scrub(value));
      return [];
    }
    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      put(copy);
      return value.map((item, index) => ({
        value: item,
        put: (made) => {
          copy[index] = made;
        },
      }));
    }
    if (!isPlainObject(value)) {
      put(value);
      return [];
    }
    const copy: Record<string, unknown> = {};
    put(copy);
    return Object.entries(value).map(([key, item]) => {
      const scrubbedKey = this.scrub(key);
      // Defined, not assigned: assigning `__proto__` would set the copy's prototype.
      Object.defineProperty(copy, scrubbedKey, ownValue(undefined));
      return {
        value: item,
        put: (made) => {
          Object.defineProperty(copy, scrubbedKey, ownValue(made));
        },
      };
    });
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

/** A value still to copy, and where its copy goes. */
interface PendingCopy {
  readonly value: unknown;
  readonly put: (copy: unknown) => void;
}

/** A plain own property, as an assignment makes one. */
function ownValue(value: unknown): PropertyDescriptor {
  return { value, writable: true, enumerable: true, configurable: true };
}
