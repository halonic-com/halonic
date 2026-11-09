// A host name in its ASCII form, the way the trust prompt shows and hashes it.
// The core has no `URL` class (plan 4.1), so the Punycode encoding of
// RFC 3492 is written out here.

const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128;

/**
 * Writes a host name in its ASCII form: lowercase, and each label with a
 * non-ASCII character as `xn--` plus its Punycode. A host that is already
 * ASCII only becomes lowercase, so `Mcp.Acme.test`, `mcp.acme.test` and
 * `MCP.ACME.TEST` are the same host.
 *
 * It applies Unicode NFC and lowercasing before encoding, which covers the
 * forms a person types. It doesn't apply the full IDNA mapping table, so it
 * never treats two different hosts as one; at worst a rare spelling of the
 * same host gets a different ASCII form.
 *
 * @param host - the host name, without port or brackets
 * @returns the host in ASCII
 *
 * @example
 * asciiHost("Bücher.example"); // "xn--bcher-kva.example"
 */
export function asciiHost(host: string): string {
  return host
    .normalize("NFC")
    .toLowerCase()
    .split(".")
    .map((label) => (isAscii(label) ? label : `xn--${punycode(label)}`))
    .join(".");
}

function isAscii(text: string): boolean {
  for (const character of text) {
    if (codePointOf(character) >= initialN) {
      return false;
    }
  }
  return true;
}

function codePointOf(character: string): number {
  // A character from `for…of` over a string always has a code point.
  return character.codePointAt(0) ?? 0;
}

/** RFC 3492 section 6.3: encodes one label's code points as Punycode. */
function punycode(label: string): string {
  const codePoints = Array.from(label, codePointOf);
  let output = codePoints
    .filter((codePoint) => codePoint < initialN)
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join("");
  const basicCount = output.length;
  if (basicCount > 0) {
    output += "-";
  }
  let n = initialN;
  let delta = 0;
  let bias = initialBias;
  let handled = basicCount;
  while (handled < codePoints.length) {
    const next = Math.min(...codePoints.filter((codePoint) => codePoint >= n));
    delta += (next - n) * (handled + 1);
    n = next;
    for (const codePoint of codePoints) {
      if (codePoint < n) {
        delta += 1;
      }
      if (codePoint === n) {
        output += encodeDelta(delta, bias);
        bias = adapt(delta, handled + 1, handled === basicCount);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}

/** Writes one delta as a generalized variable-length integer (RFC 3492 section 3.3). */
function encodeDelta(delta: number, bias: number): string {
  let output = "";
  let rest = delta;
  for (let k = base; ; k += base) {
    const threshold = Math.min(Math.max(k - bias, tMin), tMax);
    if (rest < threshold) {
      return output + digit(rest);
    }
    output += digit(threshold + ((rest - threshold) % (base - threshold)));
    rest = Math.floor((rest - threshold) / (base - threshold));
  }
}

/** RFC 3492 section 6.1: the bias for the next delta. */
function adapt(delta: number, pointCount: number, first: boolean): number {
  let scaled = first ? Math.floor(delta / damp) : Math.floor(delta / 2);
  scaled += Math.floor(scaled / pointCount);
  let k = 0;
  while (scaled > ((base - tMin) * tMax) >> 1) {
    scaled = Math.floor(scaled / (base - tMin));
    k += base;
  }
  return k + Math.floor(((base - tMin + 1) * scaled) / (scaled + skew));
}

/** The Punycode digit for 0–35: `a`–`z`, then `0`–`9`. */
function digit(value: number): string {
  return String.fromCharCode(value < 26 ? 97 + value : 22 + value);
}
