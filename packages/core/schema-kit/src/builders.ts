import { z } from "zod";

/** An IPv4 octet as `URL` writes it: 0 to 255, without leading zeros. */
const ipv4Octet = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;

/** One lower-case name label. */
const nameLabel = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`;

/**
 * A host as `URL` writes it: a dotted IPv4 address, lower-case name labels or a
 * bracketed IPv6 address. `URL` reads a name whose last label is a number, such
 * as `999.999.999.999` or `1.2.3`, as an IPv4 address and refuses or rewrites
 * it, so a name's last label may not be digits or `0x` with hex digits.
 */
const urlHost = String.raw`(?:${ipv4Octet}(?:\.${ipv4Octet}){3}|(?:${nameLabel}\.)*(?!(?:\d+|0x[0-9a-f]*)(?![a-z0-9-]))${nameLabel}|\[[0-9a-f:.]+\])`;

/** A port as `URL` writes it: 0 to 65535, without leading zeros. */
const urlPort = String.raw`(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}|0)`;

/** What may follow the host: RFC 3986's unreserved and reserved characters and `%` with two hex digits. */
const urlRest = String.raw`(?:[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*`;

/**
 * An absolute `http` or `https` URL as `URL` writes it. The core has no `URL`
 * class (plan 4.1), so this is a pattern, and stricter than Zod's `z.url()`:
 * lower-case scheme and host, no user or password, no spaces or other
 * characters `URL` would escape. Anything else, such as `mailto:` or `file:`, is refused.
 */
const URL_PATTERN = new RegExp(
  String.raw`^https?://${urlHost}(?::${urlPort})?(?:[/?#]${urlRest})?$`,
);

/**
 * Builds schemas. These are Zod's own builders, limited to the ones the file
 * format uses, so the rest of the code never imports Zod. The
 * schemas they return have Zod's methods, such as `.min()`, `.optional()`,
 * `.default()`, `.strict()`, `.extend()` and `.superRefine()`.
 *
 * @example
 * const Deployment = s.object({
 *   name: s.string().min(1),
 *   host: s.enum(["local", "cloudflare"]).default("local"),
 * }).strict();
 * type Deployment = Infer<typeof Deployment>;
 */
export const s = {
  /** Text. Add `.min()`, `.max()`, `.regex()`, `.email()` or `.url()`. */
  string: z.string,
  /** A finite number. Add `.min()`, `.max()`, `.positive()` or `.int()`. */
  number: z.number,
  /** `true` or `false`. */
  boolean: z.boolean,
  /** Only `null`. */
  null: z.null,
  /** Anything. In an object the key must still be there unless you add `.optional()`. */
  unknown: z.unknown,
  /** Exactly one value, such as `s.literal(1)` or `s.literal("text")`. */
  literal: z.literal,
  /** One of a fixed list of texts, such as `s.enum(["low", "medium", "high"])`. */
  enum: z.enum,
  /** A map with these keys. Unknown keys are dropped; add `.strict()` to refuse or `.passthrough()` to keep them. */
  object: z.object,
  /** A list whose items all match one schema. Add `.min()` or `.max()` for its length. */
  array: z.array,
  /** A list with one schema per position. */
  tuple: z.tuple,
  /** A map with any keys: every key matches the key schema and every value the value schema. */
  record: z.record,
  /** A value that matches any of the options. */
  union: z.union,
  /** A map whose value at one key picks one of the object schemas. */
  discriminatedUnion: z.discriminatedUnion,
  /** A value that matches both schemas; maps are merged. */
  intersection: z.intersection,
  /** A schema that refers to itself. */
  lazy: z.lazy,
  /** Any JSON value: null, a boolean, a finite number, text, or a list or map of JSON values. */
  json: z.json,
  /** An absolute `http` or `https` URL as `URL` writes it; see `URL_PATTERN`. */
  url: () => z.string().regex(URL_PATTERN, "must be an http or https URL as URL writes it"),
} as const;
