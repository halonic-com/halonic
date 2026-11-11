// The part of the trust content that local integrations add (trust build
// plan item 3a, HAL-188). Halonic starts their code in the runner, so a
// workspace's local integrations are covered like its connectors: where the
// folder is, what the permission sheet lets the code reach, and a hash of
// every file. Each `{ fromSetting }` host also adds the address the
// workspace's settings hold, which can arrive filled in with a clone and
// change with a `git pull` (design on HAL-1873, section 5). Built-in
// integrations are reviewed code that comes with Halonic, so they aren't in
// the content. Whether the runner is fenced is read per run and never goes
// in (I5 design 4.2).

import type {
  AddressClass,
  IntegrationSecret,
  IntegrationSecretHost,
  IntegrationSheet,
} from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";
import { secretReference } from "./trust-secret.ts";
import { trustUrl } from "./trust-url.ts";

/** One local integration, as {@link integrationsTrustContent} reads it. */
export interface LocalIntegrationInput {
  /** Its permission sheet. */
  readonly sheet: IntegrationSheet;
  /** The workspace's settings for it, such as `{ url: "http://192.168.1.20:8123" }`. */
  readonly settings: Readonly<Record<string, unknown>>;
  /** Its folder, relative to the workspace, such as `integrations/home-station`. */
  readonly folder: string;
  /** The hash of every file in its folder, from `integrationCodeDigest`. */
  readonly code: string;
}

/** One local integration's part of the trust content. */
export interface IntegrationTrustContent {
  id: string;
  /** Its folder, relative to the workspace, normalised. */
  folder: string;
  /**
   * Every host the sheet declares, with the class of address it may reach.
   * A fixed host is keyed by its name and reaches only `public` addresses;
   * a `{ fromSetting }` host is keyed `‹setting NAME›`, with the class the
   * sheet declares.
   */
  hosts: Record<string, AddressClass>;
  /** Every secret the sheet declares, by name only, sorted. */
  secrets: SecretTrustContent[];
  /** Every tool the sheet declares, by name, with its risk. */
  tools: Record<string, string>;
  /** The hash of every file in its folder. */
  code: string;
  /**
   * By setting name, the URL each `{ fromSetting }` host reads, normalised
   * (see {@link trustUrl}), or `null` while it isn't set. A URL that can't be
   * trusted, such as one with a password in it, is kept only as the reason.
   */
  addresses: Record<string, string | null>;
}

/** One secret of a local integration: where it may go and how it's sent, never its value. */
export interface SecretTrustContent {
  /** `‹secret NAME›`. */
  secret: string;
  /** The hosts it may go to, as keyed in {@link IntegrationTrustContent.hosts}, sorted. */
  hosts: string[];
  /** Where the kit puts it, with the header, prefix or form field. */
  placement: Record<string, string>;
  optional: boolean;
}

/**
 * The trust content of a workspace's local integrations, sorted by id and
 * then folder. Only the parts that decide what the code can reach are in
 * it; a description or a tool's wording is covered by the sheet the user
 * approved.
 *
 * @example
 * integrationsTrustContent([
 *   { sheet: homeStation, settings: { url: "HTTP://192.168.1.20:8123" }, folder: "integrations/home-station", code },
 * ]);
 * // [{ id: "home-station", folder: "integrations/home-station",
 * //    hosts: { "‹setting url›": "private" }, secrets: [], tools: { "read-sensors": "read" },
 * //    code: "sha256:…", addresses: { url: "http://192.168.1.20:8123/" } }]
 */
export function integrationsTrustContent(
  integrations: readonly LocalIntegrationInput[],
): IntegrationTrustContent[] {
  return integrations
    .map(integrationContent)
    .sort(
      (left, right) => compareText(left.id, right.id) || compareText(left.folder, right.folder),
    );
}

function integrationContent(integration: LocalIntegrationInput): IntegrationTrustContent {
  const { sheet } = integration;
  return {
    id: sheet.id,
    folder: posixPath.normalize(integration.folder),
    hosts: hostsContent(sheet),
    secrets: Object.entries(sheet.secrets)
      .map(([name, secret]) => secretContent(name, secret))
      .sort((left, right) => compareText(left.secret, right.secret)),
    tools: Object.fromEntries(sheet.tools.map((tool) => [tool.name, tool.risk])),
    code: integration.code,
    addresses: settingAddresses(integration),
  };
}

function hostsContent(sheet: IntegrationSheet): Record<string, AddressClass> {
  const hosts: Record<string, AddressClass> = {};
  for (const host of sheet.hosts) {
    if (typeof host === "string") {
      hosts[host] = "public";
    } else {
      hosts[settingReference(host.fromSetting)] = host.class;
    }
  }
  return hosts;
}

function secretContent(name: string, secret: IntegrationSecret): SecretTrustContent {
  return {
    secret: secretReference(name),
    hosts: secret.hosts.map(secretHostKey).sort(compareText),
    placement: placementContent(secret),
    optional: secret.optional,
  };
}

/** Where the kit puts a secret: `as`, with the header and prefix, or the form field. */
function placementContent(secret: IntegrationSecret): Record<string, string> {
  switch (secret.as) {
    case "bearer":
      return { as: secret.as };
    case "header":
      return {
        as: secret.as,
        header: secret.header,
        ...(secret.prefix === undefined ? {} : { prefix: secret.prefix }),
      };
    case "form":
      return { as: secret.as, field: secret.field };
  }
}

function secretHostKey(host: IntegrationSecretHost): string {
  return typeof host === "string" ? host : settingReference(host.fromSetting);
}

/** Names a `{ fromSetting }` host; a host name can't hold `‹`, so it never clashes with one. */
function settingReference(name: string): string {
  return `‹setting ${name}›`;
}

/** The address each setting a `{ fromSetting }` host reads holds, by setting name, sorted. */
function settingAddresses({
  sheet,
  settings,
}: LocalIntegrationInput): Record<string, string | null> {
  const names = sheet.hosts.flatMap((host) => (typeof host === "string" ? [] : [host.fromSetting]));
  const addresses: Record<string, string | null> = {};
  for (const name of [...new Set(names)].sort(compareText)) {
    const value = Object.hasOwn(settings, name) ? settings[name] : undefined;
    addresses[name] = typeof value === "string" && value !== "" ? addressContent(value) : null;
  }
  return addresses;
}

/** A setting's URL as the trust content holds it; the value of one that can't be trusted stays out. */
function addressContent(value: string): string {
  const url = trustUrl(value);
  return "url" in url ? url.url : `‹refused: ${url.refused}›`;
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
