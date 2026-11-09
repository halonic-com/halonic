import { IntegrationRefusedError } from "./integration/index.ts";
import { isLocalAddress } from "./local-address.ts";

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
  /**
   * The hosts it may call over plain `http`: only `localhost` or a private
   * address the user chose in a setting, as `host:port`. The kit
   * refuses any other address here, whatever the list says.
   */
  readonly localHosts?: readonly string[];
  /**
   * Each secret it may use, the hosts that secret may go to, and where the
   * sheet puts it. An `optional` secret, such as the key of a server that
   * may need none, is left out of the request when the workspace hasn't set
   * it up, instead of refusing the request.
   */
  readonly secrets: Readonly<Record<string, DeclaredSecret>>;
  /** The token names it may read and write. */
  readonly tokens: readonly string[];
}

/** One secret in the permission sheet. */
export interface DeclaredSecret {
  readonly hosts: readonly string[];
  readonly optional?: boolean;
  /** The only way the kit may place it; any other placement is refused. */
  readonly placement: DeclaredPlacement;
}

/** Where the sheet puts a secret: a `SecretPlacement` without the secret's name. */
export type DeclaredPlacement =
  | { readonly as: "bearer" }
  | { readonly as: "header"; readonly header: string; readonly prefix?: string }
  | { readonly as: "form"; readonly field: string };

/** Lower-case words joined by `-`: integration, secret-reference and token names. */
export const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Parses a URL the integration asked for, refusing anything but an allowed
 * `https` host or an allowed local `http` host.
 */
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
  const plainLocal =
    url.protocol === "http:" &&
    hostIn(policy.localHosts ?? [], url) &&
    isLocalAddress(url.hostname);
  if (url.protocol !== "https:" && !plainLocal) {
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
  if (!plainLocal && !hostIn(policy.hosts, url)) {
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
