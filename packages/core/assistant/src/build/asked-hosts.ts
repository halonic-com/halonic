// What a permission sheet or a connector file asks for: the hosts it may
// reach, its secrets and its OAuth sign-ins (`assistant.build.named-hosts-secrets`).
// A `{ fromSetting }` host isn't in it: the person fills that in later.

import { type Connector, type IntegrationSheet, placedSecrets } from "@halonicjs/format";
import { hostPattern } from "./named-hosts.ts";

/** One host a file asks for, as it writes it. */
export interface AskedHost {
  /** The host name, an IPv4 address or a bracketed IPv6 address. */
  readonly name: string;
  readonly port: string | undefined;
  /** The scheme it is reached over, for its default port. */
  readonly scheme: string;
}

/** What a sheet or a connector file asks for. */
export interface Asks {
  readonly hosts: readonly AskedHost[];
  /** The sheet's secrets by name; a connector has none of its own. */
  readonly secrets: readonly string[];
  /** The sheet's OAuth sign-ins by name. */
  readonly oauth: readonly string[];
}

/** What a file asks for when it asks for nothing. */
export const nothingAsked: Asks = { hosts: [], secrets: [], oauth: [] };

/** Said for a file with a URL whose host can't be read without doubt. */
export const unreadableUrl = "unreadable-url";

/**
 * What a sheet asks for: the hosts in `hosts`, in its secrets, in its
 * sign-ins' URLs and token hosts and in `googleCheck`.
 */
export function sheetAsks(sheet: IntegrationSheet): Asks | typeof unreadableUrl {
  const signIns = Object.values(sheet.signIns);
  const fixed = [
    ...sheet.hosts,
    ...placedSecrets(sheet.secrets).flatMap(([, secret]) => secret.hosts),
    ...signIns.flatMap((signIn) => signIn.access.hosts),
  ].filter((host) => typeof host === "string");
  const urls = [
    ...signIns.flatMap((each) => [each.authorizeUrl, each.tokenUrl, each.revokeUrl, each.issuer]),
    sheet.googleCheck?.url,
  ].filter((url) => typeof url === "string");
  const fromUrls = urlHosts(urls);
  if (fromUrls === unreadableUrl) return unreadableUrl;
  return {
    hosts: [...fixed.map(writtenHost), ...fromUrls],
    secrets: Object.keys(sheet.secrets),
    oauth: Object.keys(sheet.signIns),
  };
}

/**
 * What a connector asks for: the host of an `http` server, the sites of a
 * `stdio` program, or the hosts in a local integration's settings. A
 * setting is where a `{ fromSetting }` host comes from, so the model can't
 * fill one in that the person didn't name.
 */
export function connectorAsks(connector: Connector): Asks | typeof unreadableUrl {
  const { transport } = connector;
  let hosts: AskedHost[] | typeof unreadableUrl = [];
  if ("http" in transport) {
    hosts = urlHosts([transport.http.url]);
  } else if ("stdio" in transport) {
    hosts = (transport.stdio.sites ?? []).map(writtenHost);
  } else if ("integration" in transport) {
    const values = Object.values(transport.integration.settings ?? {});
    hosts = settingHosts(values.filter((value) => typeof value === "string"));
  }
  return hosts === unreadableUrl ? unreadableUrl : { ...nothingAsked, hosts };
}

/** A host written without a scheme, `name` or `name:port`, reached over `https`. */
function writtenHost(host: string): AskedHost {
  const [, name = host, port] = /^(.*?)(?::(\d+))?$/u.exec(host) ?? [];
  return { name, port, scheme: "https" };
}

/**
 * The host of each URL, read the way a URL reader finds it: after any
 * `user@`, up to the first `/`, `\`, `?` or `#`. A URL with a space or a
 * control character, or a host with any other mark, such as `%`, can't be
 * read without doubt, since a URL reader would change it before it
 * connects; then the answer is {@link unreadableUrl}.
 */
function urlHosts(urls: readonly string[]): AskedHost[] | typeof unreadableUrl {
  const hosts: AskedHost[] = [];
  for (const url of urls) {
    const parts = urlParts.exec(url);
    const [, scheme, name, port] = parts ?? [];
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a URL reader drops control characters.
    if (/[\s\u0000-\u001f\u007f]/u.test(url) || scheme === undefined || name === undefined) {
      return unreadableUrl;
    }
    if (!/^(?:\[[0-9a-f:.]+\]|[\p{L}\p{N}.-]+)$/iu.test(name)) return unreadableUrl;
    hosts.push({ name, port: port === "" ? undefined : port, scheme });
  }
  return hosts;
}

/** A URL's scheme, host and port: the user name and password are skipped. */
const urlParts =
  /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#\\]*@)?(\[[^\]/?#\\]*\]|[^:/?#\\]*)(?::(\d*))?(?:[/?#\\]|$)/iu;

/**
 * The hosts in settings' values: a value with `://` is a URL, read as
 * {@link urlHosts} reads one; in any other value, each host the person's
 * own text would name, wherever it starts.
 */
function settingHosts(values: readonly string[]): AskedHost[] | typeof unreadableUrl {
  const hosts: AskedHost[] = [];
  for (const value of values) {
    const found = value.includes("://")
      ? urlHosts([value])
      : [...value.matchAll(new RegExp(hostPattern, "giu"))].map(([, scheme, name = "", port]) => ({
          name,
          port,
          scheme: scheme ?? "https",
        }));
    if (found === unreadableUrl) return unreadableUrl;
    hosts.push(...found);
  }
  return hosts;
}
