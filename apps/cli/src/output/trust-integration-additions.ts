// The "New:" lines under a changed local integration in the trust check
// (HAL-511, HAL-18391 plan section 2.5): one for each host, secret or tool a
// fix or an edit gave it since it was trusted. What it no longer has gets no
// line (HAL-65 decision 9).

import { type ChangedIntegration, integrationAdditions } from "@halonicjs/workspace";
import type { Message } from "../messages/define.ts";
import { type Phrase, phrase } from "../messages/phrase.ts";
import { trustMessages } from "../messages/trust.ts";
import { printable } from "./printable.ts";
import { underRow } from "./trust-row-lines.ts";

/**
 * "New: can also reach cdn.shopify.com", then the new secrets, then the new
 * tools, each on its own line under the integration's Changed rows.
 */
export function integrationAdditionLines(changed: ChangedIntegration): Phrase[] {
  const added = integrationAdditions(changed);
  const lines: Message[] = [
    ...added.hosts.map(newHost),
    ...added.secrets.map((secret) => trustMessages.integrationNewSecret(secretName(secret))),
    ...added.tools.map((tool) => trustMessages.integrationNewTool(printable(tool))),
  ];
  return lines.map((line) => phrase`${underRow}${line.phrase}`);
}

/** A host by its name, or a `‹setting NAME›` host by the setting that holds its address. */
function newHost(host: string): Message {
  const setting = /^‹setting (.+)›$/u.exec(host)?.[1];
  return setting === undefined
    ? trustMessages.integrationNewHost(printable(host))
    : trustMessages.integrationNewSettingHost(printable(setting));
}

/** The name in a `‹secret NAME›` reference, escaped. */
function secretName(reference: string): string {
  return printable(/^‹secret (.+)›$/u.exec(reference)?.[1] ?? reference);
}
