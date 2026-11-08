import { IntegrationRefusedError } from "./refused.ts";

/**
 * What one integration may do, taken from its permission sheet after any
 * `fromSetting` host is resolved. The kit enforces exactly this.
 */
export interface IntegrationPolicy {
  /** The integration's name, for messages and for scoping its tokens. */
  readonly name: string;
  /**
   * The hosts it may call: a host name, or `host:port` for a port other than
   * 443. Matched exactly, ignoring case. No wildcards.
   */
  readonly hosts: readonly string[];
  /** Each secret it may use, and the hosts that secret may go to. */
  readonly secrets: Readonly<Record<string, { readonly hosts: readonly string[] }>>;
  /** The token names it may read and write. */
  readonly tokens: readonly string[];
}

/** Lower-case words joined by `-`: integration, secret-reference and token names. */
export const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Parses a URL the integration asked for, refusing anything but an allowed `https` host. */
export function allowedUrl(policy: IntegrationPolicy, raw: unknown, base?: URL): URL {
  let url: URL;
  try {
    if (typeof raw !== "string") throw new TypeError("not a string");
    url = new URL(raw, base);
  } catch {
    throw new IntegrationRefusedError(
      "bad-url",
      `${policy.name}: the request URL is not a valid absolute URL`,
    );
  }
  if (url.protocol !== "https:") {
    throw new IntegrationRefusedError(
      "scheme-not-allowed",
      `${policy.name}: only https is allowed, not ${url.protocol.replace(/:$/, "")}`,
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new IntegrationRefusedError(
      "bad-url",
      `${policy.name}: a URL may not carry a user name or password`,
    );
  }
  if (!hostIn(policy.hosts, url)) {
    throw new IntegrationRefusedError(
      "host-not-allowed",
      `${policy.name}: ${url.host} is not one of the hosts in its permission sheet`,
    );
  }
  return url;
}

/** Whether the URL's host is in the list, by exact match ignoring case. */
export function hostIn(hosts: readonly string[], url: URL): boolean {
  const host = url.host.toLowerCase();
  return hosts.some((allowed) => allowed.toLowerCase() === host);
}
