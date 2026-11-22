// The only names and addresses the report may hold (first-run-progress 4.3).
// A provider's name and a server's address come from the workspace's files and
// can be anything a person typed, such as "LM Studio (Acme laptop)" or a
// company's host name. So each passes only when it is one of a known few;
// anything else is replaced by a fixed phrase, never cleaned up.

/** The products Halonic has provider types for (`providerTypes` in `@halonicjs/format`), by name. */
const knownProviders: readonly string[] = ["Anthropic", "OpenAI", "Ollama", "LM Studio"];

/**
 * A provider's name as the report may hold it: the name when it is one of the products Halonic
 * has a provider type for, else "another provider".
 *
 * @example
 * providerInReport("Anthropic"); // "Anthropic"
 * providerInReport("LM Studio (Acme laptop)"); // "another provider"
 */
export function providerInReport(name: string): string {
  return knownProviders.includes(name) ? name : "another provider";
}

/** The names this computer has, which the report may hold with a port. */
const thisComputer: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/**
 * A model server's address as the report may hold it: `localhost:11434` for this computer, with a
 * port of digits only; any other address reads "an address on your network".
 *
 * @example
 * addressInReport("localhost:11434"); // "localhost:11434"
 * addressInReport("gpu.acme.internal:8080"); // "an address on your network"
 */
export function addressInReport(address: string): string {
  const colon = address.lastIndexOf(":");
  const host = address.slice(0, colon);
  const port = address.slice(colon + 1);
  const shown = colon > 0 && thisComputer.includes(host) && /^\d{1,5}$/.test(port);
  return shown ? address : "an address on your network";
}

/**
 * A cause id as the report may hold it: the doctor's `<line>.<reason>` ids are made of lowercase
 * words and hyphens only; anything else reads "unknown".
 *
 * @example
 * causeInReport("last-run.out-of-credit"); // "last-run.out-of-credit"
 */
export function causeInReport(cause: string): string {
  return /^[a-z-]+\.[a-z-]+$/.test(cause) ? cause : "unknown";
}

/** A day as "8 Nov", the same in every language. */
export function dayInReport(at: Date): string {
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${at.getDate()} ${months[at.getMonth()]}`;
}

/** A time of day as "10:42". */
export function timeInReport(at: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
}
