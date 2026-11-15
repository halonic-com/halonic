import type { Provider } from "@halonicjs/format";
import { type UrlHost, urlHost } from "@halonicjs/std";
import type { ModelTarget } from "./resolve-model.ts";

/** A header whose name says it carries a credential. */
const authHeaderName = /auth|key|token|secret|credential|cookie/i;

/** The parts of a provider the cost rules read. */
type CostProvider = Pick<Provider, "type" | "baseUrl" | "secret" | "options">;

/**
 * Whether requests to a provider stay on this machine (HAL-63 B4). It
 * fails closed: only the test model (by its type, never by a setting) and a
 * `baseUrl` whose host is `localhost`, in `127.0.0.0/8` or `::1` count. A
 * gateway or tunnel on a loopback address may forward to a paid service,
 * so this alone doesn't say there is no cost, see {@link isNoCostOnThisMachine}.
 * No address is looked up and no text is matched: an address that can't be
 * read, or no `baseUrl`, is not this machine.
 *
 * @example
 * isOnThisMachine({ type: "ollama", baseUrl: "http://127.1:11434/v1", options: {} }); // true
 * isOnThisMachine({ type: "openai", baseUrl: "http://localhost.evil.example", options: {} }); // false
 */
export function isOnThisMachine(provider: CostProvider): boolean {
  if (provider.type === "mock") {
    return true;
  }
  const host = provider.baseUrl === undefined ? undefined : urlHost(provider.baseUrl);
  return host !== undefined && isLoopback(host);
}

/**
 * Whether a model on this machine is also free (HAL-63 B4): the provider is
 * on this machine, has no secret and no auth-like header, and the model's
 * name doesn't end in `cloud` (Ollama's cloud models run elsewhere) and has
 * no price set by the user. Only the presence of a key is checked, never
 * its value.
 *
 * @example
 * isNoCostOnThisMachine(ollama, { model: "llama3.2" }); // true
 * isNoCostOnThisMachine(ollama, { model: "gpt-oss:120b-cloud" }); // false
 */
export function isNoCostOnThisMachine(
  provider: CostProvider,
  model: Pick<ModelTarget, "model" | "price">,
): boolean {
  return (
    isOnThisMachine(provider) &&
    !holdsCredential(provider) &&
    !model.model.toLowerCase().endsWith("cloud") &&
    model.price === undefined
  );
}

/**
 * Whether a provider may bill per use (HAL-63 B3), which is when the
 * Studio asks for prices and a budget. It is when the provider isn't on
 * this machine without a cost, and has a secret, an auth-like header in
 * `options.headers`, a query string in its `baseUrl`, or a public host: not
 * `10/8`, `172.16/12`, `192.168/16`, `fc00::/7`, `fe80::/10`, a single-label
 * name or this machine. A host that can't be read, or no `baseUrl`, is
 * public. A false yes costs little, as the step always offers "No limit".
 *
 * @example
 * isPayPerUse({ type: "anthropic", baseUrl: "https://api.anthropic.com/v1", options: {} }); // true
 * isPayPerUse({ type: "lmstudio", baseUrl: "http://192.168.1.20:1234/v1", options: {} }); // false
 */
export function isPayPerUse(provider: CostProvider): boolean {
  if (provider.type === "mock") {
    return false;
  }
  return (
    holdsCredential(provider) ||
    hasQuery(provider.baseUrl) ||
    !isPrivateHost(provider.baseUrl === undefined ? undefined : urlHost(provider.baseUrl))
  );
}

function holdsCredential(provider: CostProvider): boolean {
  const headers = provider.options["headers"];
  const hasAuthHeader =
    typeof headers === "object" &&
    headers !== null &&
    Object.keys(headers).some((name) => authHeaderName.test(name));
  return (provider.secret ?? "") !== "" || hasAuthHeader;
}

function hasQuery(baseUrl: string | undefined): boolean {
  return baseUrl !== undefined && /^[^#]*\?/.test(baseUrl);
}

function isLoopback(host: UrlHost): boolean {
  switch (host.kind) {
    case "domain":
      return host.name === "localhost";
    case "ipv4":
      return host.octets[0] === 127;
    case "ipv6":
      return host.groups.every((group, index) => group === (index === 7 ? 1 : 0));
  }
}

/** A host that is not on the internet: this machine, a private range or a single-label name. */
function isPrivateHost(host: UrlHost | undefined): boolean {
  if (host === undefined) {
    return false;
  }
  if (isLoopback(host)) {
    return true;
  }
  switch (host.kind) {
    case "domain":
      return !host.name.includes(".");
    case "ipv4": {
      const [first = 0, second = 0] = host.octets;
      return (
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      );
    }
    case "ipv6": {
      const first = host.groups[0] ?? 0;
      return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
    }
  }
}
