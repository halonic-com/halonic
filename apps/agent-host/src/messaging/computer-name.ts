/** The longest device name the pair route takes, in characters. */
const longest = 80;

/**
 * The computer's name as Pair with a server suggests it
 * (`agent-host.server-engine-pairing`): without control or format
 * characters, trimmed and cut to 80 characters, so the pair route takes it
 * as it is; `undefined` when nothing is left. It goes to the local page only.
 *
 * @param hostname - the system's name for the computer, `os.hostname()`
 */
export function computerName(hostname: string): string | undefined {
  const cleaned = hostname.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  // By code point, so a character outside the BMP is never cut in half.
  const name = [...cleaned].slice(0, longest).join("").trim();
  return name === "" ? undefined : name;
}
