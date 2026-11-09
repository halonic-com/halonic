import type { Path } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import type { IntegrationHost, IntegrationSecret, IntegrationSheet } from "./schema.ts";

/**
 * What one integration may do, in the shape of the kit's `IntegrationPolicy`
 * (`adapters/integration-kit`). The core can't import an adapter, so the
 * shape is repeated here; the kit enforces it.
 */
export interface IntegrationPolicy {
  readonly name: string;
  /** Hosts it may call over `https`: a host name, or `host:port` for a port other than 443. */
  readonly hosts: readonly string[];
  /** Hosts the user chose that it may call over plain `http`: on this machine or a private network. */
  readonly localHosts?: readonly string[];
  /** Each secret, the hosts it may go to, whether a request may go without it, and where it goes. */
  readonly secrets: Readonly<Record<string, DeclaredSecret>>;
  readonly tokens: readonly string[];
}

/** One secret as the kit takes it. */
export interface DeclaredSecret {
  readonly hosts: readonly string[];
  readonly optional?: boolean;
  /** Where the sheet puts it. The kit refuses any other placement. */
  readonly placement: DeclaredPlacement;
}

/** Where the sheet puts a secret, as the kit's `DeclaredPlacement` says. */
export type DeclaredPlacement =
  | { readonly as: "bearer" }
  | { readonly as: "header"; readonly header: string; readonly prefix?: string }
  | { readonly as: "form"; readonly field: string };

/** The kit's request limits, as the sheet gives them. */
export type IntegrationLimits = NonNullable<IntegrationSheet["limits"]>;

/** What the kit needs to build an integration's host. */
export interface ResolvedIntegration {
  readonly policy: IntegrationPolicy;
  /** Left out when the sheet has none: the kit's defaults apply. */
  readonly limits?: IntegrationLimits;
}

/** Why a `fromSetting` host can't be resolved. */
export interface PolicyProblem {
  readonly code:
    | "setting-missing"
    | "setting-not-a-url"
    | "plain-http-not-local"
    | "secret-over-plain-http";
  /** Where the host sits in the sheet. */
  readonly path: Path;
  readonly message: string;
}

/**
 * Turns a parsed sheet and the integration's settings into the policy the
 * kit enforces. A `{ fromSetting }` host becomes the host of the URL in that
 * setting. This is the only place plain `http` is allowed: to a host on
 * this machine or a private network, and a secret only to this machine.
 *
 * An optional secret may still list a private-network host over `http`:
 * without a key the request goes out bare, and with one the kit refuses it.
 *
 * @example
 * const resolved = integrationPolicy(sheet, { url: "http://localhost:8080/mcp" });
 * if (resolved.ok) createIntegrationHost({ policy: resolved.value.policy, ...ports });
 */
export function integrationPolicy(
  sheet: IntegrationSheet,
  settings: Readonly<Record<string, unknown>>,
): Result<ResolvedIntegration, PolicyProblem[]> {
  const problems: PolicyProblem[] = [];
  const hosts: string[] = [];
  const localHosts: string[] = [];
  sheet.hosts.forEach((host, index) => {
    const found = resolveHost(sheet, host, settings, ["hosts", index], problems);
    if (found !== undefined) {
      (found.plain ? localHosts : hosts).push(found.host);
    }
  });

  const secrets: Record<string, DeclaredSecret> = {};
  for (const [name, secret] of Object.entries(sheet.secrets)) {
    const secretHosts: string[] = [];
    secret.hosts.forEach((host, index) => {
      const path = ["secrets", name, "hosts", index];
      const found = resolveHost(sheet, host, settings, path, problems);
      if (found === undefined) {
        return;
      }
      if (found.plain && !secret.optional && !isLoopback(found.hostname)) {
        problems.push({
          code: "secret-over-plain-http",
          path,
          message: `${sheet.id}: the secret "${name}" may go over plain http only to this machine, not to ${found.host}`,
        });
        return;
      }
      secretHosts.push(found.host);
    });
    const resolved = unique(secretHosts);
    const placement = placementOf(secret);
    secrets[name] = secret.optional
      ? { hosts: resolved, optional: true, placement }
      : { hosts: resolved, placement };
  }
  if (problems.length > 0) {
    return err(problems);
  }

  const policy: IntegrationPolicy = {
    name: sheet.id,
    hosts: unique(hosts),
    ...(localHosts.length > 0 ? { localHosts: unique(localHosts) } : {}),
    secrets,
    tokens: sheet.tokens.map((token) => token.name),
  };
  return ok(sheet.limits === undefined ? { policy } : { policy, limits: sheet.limits });
}

/** The placement part of a sheet's secret, without its purpose and hosts. */
function placementOf(secret: IntegrationSecret): DeclaredPlacement {
  switch (secret.as) {
    case "bearer":
      return { as: "bearer" };
    case "header":
      return secret.prefix === undefined
        ? { as: "header", header: secret.header }
        : { as: "header", header: secret.header, prefix: secret.prefix };
    case "form":
      return { as: "form", field: secret.field };
  }
}

interface FoundHost {
  /** As the kit matches it: `URL.host`, without the scheme's default port. */
  readonly host: string;
  readonly hostname: string;
  /** Plain `http`, so only to a local address. */
  readonly plain: boolean;
}

function resolveHost(
  sheet: IntegrationSheet,
  host: IntegrationHost,
  settings: Readonly<Record<string, unknown>>,
  path: Path,
  problems: PolicyProblem[],
): FoundHost | undefined {
  if (typeof host === "string") {
    return { host, hostname: host, plain: false };
  }
  const setting = host.fromSetting;
  const value = Object.hasOwn(settings, setting) ? settings[setting] : undefined;
  if (typeof value !== "string" || value === "") {
    problems.push({
      code: "setting-missing",
      path,
      message: `${sheet.id}: the setting "${setting}" must hold the server's URL`,
    });
    return undefined;
  }
  const found = parseUrlHost(value);
  if (found === undefined) {
    problems.push({
      code: "setting-not-a-url",
      path,
      message: `${sheet.id}: the setting "${setting}" must be an http or https URL without a user name or password`,
    });
    return undefined;
  }
  if (found.plain && !isLocalAddress(found.hostname)) {
    problems.push({
      code: "plain-http-not-local",
      path,
      message: `${sheet.id}: plain http is allowed only to this machine or a private network address, not to ${found.host}; use https`,
    });
    return undefined;
  }
  return found;
}

/**
 * The scheme, host and port of an absolute `http` or `https` URL, as
 * `URL.host` gives them. The core has no `URL` class (plan 4.1), so this
 * reads it by hand and accepts only the plain forms `URL` leaves unchanged:
 * a name or dotted IPv4 address in lower case or a bracketed IPv6 address
 * as `URL` writes it. Anything else is refused, so the kit's own match never
 * sees a host spelled two ways.
 */
function parseUrlHost(url: string): FoundHost | undefined {
  const parts = /^(https?):\/\/([^/?#]*)(?:[/?#]|$)/i.exec(url);
  const scheme = parts?.[1]?.toLowerCase();
  const authority = parts?.[2]?.toLowerCase() ?? "";
  const hostAndPort =
    /^(\[[0-9a-f:]+\]|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)(?::(\d{1,5}))?$/.exec(
      authority,
    );
  const hostname = hostAndPort?.[1];
  if (scheme === undefined || hostname === undefined) {
    return undefined;
  }
  if (hostname.startsWith("[") ? !canonicalIpv6(hostname) : !canonicalIpv4(hostname)) {
    return undefined;
  }
  const port = hostAndPort?.[2];
  if (port !== undefined && (Number(port) > 65535 || port !== String(Number(port)))) {
    return undefined;
  }
  const defaultPort = scheme === "https" ? "443" : "80";
  const host = port === undefined || port === defaultPort ? hostname : `${hostname}:${port}`;
  return { host, hostname, plain: scheme === "http" };
}

/**
 * `URL` reads a name whose last part is a number as an IPv4 address, so such
 * a name must be four parts of 0 to 255 without leading zeros, as `URL`
 * writes it.
 */
function canonicalIpv4(hostname: string): boolean {
  if (!/(?:^|\.)\d+$/.test(hostname)) {
    return true;
  }
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  );
}

/**
 * A bracketed IPv6 address as `URL` writes it: eight groups in lower-case hex
 * without leading zeros, the longest run of two or more zero groups (the
 * first, on a tie) written `::`, and no dotted IPv4 tail.
 */
function canonicalIpv6(bracketed: string): boolean {
  const address = bracketed.slice(1, -1);
  const halves = address.split("::");
  const groupsOf = (half: string) => (half === "" ? [] : half.split(":"));
  const head = groupsOf(halves[0] ?? "");
  const tail = groupsOf(halves[1] ?? "");
  const zeros = 8 - head.length - tail.length;
  if (halves.length > 2 || (halves.length === 2 ? zeros < 1 : zeros !== 0)) {
    return false;
  }
  if (![...head, ...tail].every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
    return false;
  }
  const groups = [...head, ...Array<string>(zeros).fill("0"), ...tail].map((group) =>
    Number.parseInt(group, 16).toString(16),
  );
  let start = -1;
  let length = 0;
  for (let i = 0; i < 8; i += 1) {
    let end = i;
    while (end < 8 && groups[end] === "0") {
      end += 1;
    }
    if (end - i >= 2 && end - i > length) {
      start = i;
      length = end - i;
    }
  }
  const written =
    start === -1
      ? groups.join(":")
      : `${groups.slice(0, start).join(":")}::${groups.slice(start + length).join(":")}`;
  return written === address;
}

// The same rules as the kit's `local-address.ts`, which checks again on every
// request: only literal addresses and `localhost` count, since a name can
// resolve anywhere. Link-local addresses (169.254/16) don't count.

/** `localhost`, `127.0.0.0/8` or `::1`: this machine. */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || ipv4(hostname)?.[0] === 127;
}

/** Loopback, or `10/8`, `172.16/12`, `192.168/16` or IPv6 `fc00::/7`. */
function isLocalAddress(hostname: string): boolean {
  if (isLoopback(hostname)) {
    return true;
  }
  const v4 = ipv4(hostname);
  if (v4 !== undefined) {
    const [a = 0, b = 0] = v4;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^\[f[cd][0-9a-f]{2}:/.test(hostname);
}

/** The four numbers of a whole dotted IPv4 address, as the kit reads it. */
function ipv4(hostname: string): readonly number[] | undefined {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  return parts?.slice(1).map(Number);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
