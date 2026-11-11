// The part of the trust content that local integrations add (trust build
// plan item 3a, HAL-188). Halonic starts their code in the runner, so a
// workspace's local integrations are covered like its connectors: where the
// folder is, what the permission sheet lets the code do, and a hash of every
// file. Each `{ fromSetting }` host also adds the address the workspace's
// settings hold, which can arrive filled in with a clone and change with a
// `git pull` (design on HAL-1873, section 5). Built-in integrations are
// reviewed code that comes with Halonic, so they aren't in the content.
// Whether the runner is fenced is read per run and never goes in (I5 design
// 4.2).
//
// `integration.yaml` sits in the folder, so `code` already covers every byte
// of the sheet. The sheet's fields below are in the content as well so a
// change can name them: a change to a host shows as `hosts` and `code`, a
// change to the wording only as `code`. These fields are the ones that widen
// what the code may do:
// - `provides`: which data Halonic hands the code, such as a model's prompts.
// - `hosts` and `secrets`: where it may talk to, and what it may send there.
// - `googleScopes`, the scopes only: how much of the user's Google data the
//   token reaches.
// - `tools`, each with its risk and whether its result is marked as outside
//   content (`untrusted`).
// - `needs`: `process` starts a local program.
// The rest only shows as `code`: `id` and `version` name it, `kit` picks the
// port version, the words (descriptions, a tool's `noun`, a scope's
// `reason`, the Google API names) are what the user reads, `googleApis` and
// `googleCheck` only guide the Google setup and the one read after sign-in,
// `tokens` are values the code keeps for itself, `limits` can only make a
// request stop sooner, and `recording` only affects the recorder in tests.

import type {
  AddressClass,
  IntegrationSecret,
  IntegrationSecretHost,
  IntegrationSheet,
} from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";
import { isCleanRelativePath } from "./trust-integration-code.ts";
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
  /** Its folder, relative to the workspace, normalised, without a trailing `/`. */
  folder: string;
  /** What it provides, sorted, such as `["connector"]`. */
  provides: string[];
  /**
   * Every host the sheet declares, with the class of address it may reach.
   * A fixed host is keyed by its name and reaches only `public` addresses;
   * a `{ fromSetting }` host is keyed `‹setting NAME›`, with the class the
   * sheet declares.
   */
  hosts: Record<string, AddressClass>;
  /** Every secret the sheet declares, by name only, sorted. */
  secrets: SecretTrustContent[];
  /** Every Google scope the `google-account` token gets, without its reason, sorted. */
  googleScopes: string[];
  /** Every tool the sheet declares, by name. */
  tools: Record<string, ToolTrustContent>;
  /** The capabilities it needs beyond HTTP, sorted, such as `["process"]`. */
  needs: string[];
  /** The hash of every file in its folder. */
  code: string;
  /**
   * By setting name, the URL each `{ fromSetting }` host reads, normalised
   * (see {@link trustUrl}), or `null` while it isn't set. A URL that can't be
   * trusted, such as one with a password in it, is kept only as the reason.
   */
  addresses: Record<string, string | null>;
}

/** One tool of a local integration: what it may do, and whether its result is marked as outside content. */
export interface ToolTrustContent {
  risk: string;
  untrusted: boolean;
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
 * The trust content of a workspace's local integrations, sorted by id. Of the sheet, only the fields that decide what the code
 * can do are in it on their own; its wording changes only `code`, the hash
 * of every file, `integration.yaml` included.
 *
 * @throws {RangeError} when a folder is absolute, outside the workspace or
 * not clean, or two integrations have the same id.
 *
 * @example
 * integrationsTrustContent([
 *   { sheet: homeStation, settings: { url: "HTTP://192.168.1.20:8123" }, folder: "integrations/home-station", code },
 * ]);
 * // [{ id: "home-station", folder: "integrations/home-station",
 * //    provides: ["connector"], hosts: { "‹setting url›": "private" }, secrets: [],
 * //    googleScopes: [], tools: { "read-sensors": { risk: "read", untrusted: false } },
 * //    needs: [], code: "sha256:…", addresses: { url: "http://192.168.1.20:8123/" } }]
 */
export function integrationsTrustContent(
  integrations: readonly LocalIntegrationInput[],
): IntegrationTrustContent[] {
  checkUniqueIds(integrations);
  return integrations.map(integrationContent).sort((left, right) => compareText(left.id, right.id));
}

function integrationContent(integration: LocalIntegrationInput): IntegrationTrustContent {
  const { sheet } = integration;
  return {
    id: sheet.id,
    folder: folderContent(integration.folder),
    provides: [...sheet.provides].sort(compareText),
    hosts: hostsContent(sheet),
    secrets: Object.entries(sheet.secrets)
      .map(([name, secret]) => secretContent(name, secret))
      .sort((left, right) => compareText(left.secret, right.secret)),
    googleScopes: (sheet.googleScopes ?? []).map((scope) => scope.scope).sort(compareText),
    tools: Object.fromEntries(
      sheet.tools.map((tool) => [tool.name, { risk: tool.risk, untrusted: tool.untrusted }]),
    ),
    needs: [...sheet.needs].sort(compareText),
    code: integration.code,
    addresses: settingAddresses(integration),
  };
}

/**
 * The folder, normalised and without a trailing `/`. One that is absolute,
 * leaves the workspace or could be spelled another way (with `\`, say) is a
 * bug in whoever read it, so it is refused rather than trusted.
 */
function folderContent(folder: string): string {
  const normalized = posixPath.normalize(folder).replace(/\/+$/, "");
  if (folder.startsWith("/") || !isCleanRelativePath(normalized)) {
    throw new RangeError(
      `"${folder}" isn't a folder inside the workspace, such as "integrations/home-station".`,
    );
  }
  return normalized;
}

/** Refuses two integrations with the same id: the trust changes match them by id. */
function checkUniqueIds(integrations: readonly LocalIntegrationInput[]): void {
  const seen = new Set<string>();
  for (const { sheet } of integrations) {
    if (seen.has(sheet.id)) {
      throw new RangeError(`Two local integrations have the id "${sheet.id}".`);
    }
    seen.add(sheet.id);
  }
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
