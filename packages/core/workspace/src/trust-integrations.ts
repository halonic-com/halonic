// The part of the trust content that local integrations add: the address
// each `{ fromSetting }` host reads from the workspace's settings. Those
// settings can arrive filled in with a clone and change with a `git pull`,
// so a new value asks for trust again and shows under "What changed"
// (design on HAL-1873, section 5). The rest of a local integration, its
// permission sheet, is covered by the sheet the user approved.

import type { IntegrationSheet } from "@halonicjs/format";
import { trustUrl } from "./trust-url.ts";

/** One local integration, as {@link integrationsTrustContent} reads it. */
export interface LocalIntegrationInput {
  /** Its permission sheet. */
  readonly sheet: IntegrationSheet;
  /** The workspace's settings for it, such as `{ url: "http://192.168.1.20:8123" }`. */
  readonly settings: Readonly<Record<string, unknown>>;
}

/** One local integration's part of the trust content. */
export interface IntegrationTrustContent {
  id: string;
  /**
   * By setting name, the URL each `{ fromSetting }` host reads, normalised
   * (see {@link trustUrl}), or `null` while it isn't set. A URL that can't be
   * trusted, such as one with a password in it, is kept only as the reason.
   */
  addresses: Record<string, string | null>;
}

/**
 * The trust content of the local integrations that read an address from the
 * workspace's settings, sorted by id. An integration without a
 * `{ fromSetting }` host adds nothing, so a workspace without one has the
 * same content and fingerprint as before.
 *
 * @example
 * integrationsTrustContent([{ sheet: homeStation, settings: { url: "HTTP://192.168.1.20:8123" } }]);
 * // [{ id: "home-station", addresses: { url: "http://192.168.1.20:8123/" } }]
 */
export function integrationsTrustContent(
  integrations: readonly LocalIntegrationInput[],
): IntegrationTrustContent[] {
  return integrations
    .flatMap((integration) => {
      const addresses = settingAddresses(integration);
      return Object.keys(addresses).length === 0 ? [] : [{ id: integration.sheet.id, addresses }];
    })
    .sort((left, right) => compareText(left.id, right.id));
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
