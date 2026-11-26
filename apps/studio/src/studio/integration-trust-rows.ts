// The workspace trust check's Integrations section (the "Runs" line design section 4, HAL-1873;
// microcopy 24.1 R4, R6, R9 and R12): one row per local integration, in the CLI's content.

import {
  type AssistantAddedHosts,
  assistantAddedIn,
  type RunnerUnfencedReason,
  runnerUnfencedWords,
} from "@halonicjs/app";
import { unfencedAllowedLine } from "@halonicjs/studio-feature-plugins/api";
import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import {
  type ChangedIntegration,
  type IntegrationTrustContent,
  integrationAdditions,
} from "@halonicjs/workspace";

/**
 * Whether integration code runs in the sandbox on this computer, as the host says when the check
 * opens (the "Runs" line design section 4, HAL-1873): `checking` while it answers, `undefined`
 * where it can't say, which leaves the Runs row out. Not in the sandbox, `allowedOn` is the day of
 * the yes saved for this reason, such as "9 Nov", else absent.
 */
export type IntegrationRuns =
  | { readonly state: "checking" }
  | { readonly state: "fenced" }
  | {
      readonly state: "not-fenced";
      readonly reason: RunnerUnfencedReason;
      readonly allowedOn?: string | undefined;
    }
  | undefined;

/** The Integrations section's line under its heading (microcopy 24.1 R12). */
export const integrationsIntro =
  "Code in this workspace that connects to a service. It runs apart from Studio.";

/** An integration's Runs row in the sandbox (R12). */
export const integrationRunsFenced =
  "On its own, with no access to your files or other programs. It can only reach the addresses and use the secrets listed here.";

/**
 * An integration's Runs row where it can't run in the sandbox, in amber with the triangle (R12):
 * with the person's yes it starts without it, in Studio's agent host and in the command line.
 */
export const integrationRunsUnfenced =
  "Not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach other addresses.";

/** After an integration's name where it can't run in the sandbox (R12, design section 4). */
export const integrationNotFencedFlag = "not in the sandbox";

/**
 * After a host the assistant added to the sheet that the person didn't name in the chat (HAL-525).
 * It stays until the host leaves the sheet, also once the person types it in by hand.
 */
export const assistantAddedMark = "added by the assistant";

/** The Runs row while the host answers (R4). */
export const integrationRunsChecking = "Checking the sandbox on this computer…";

/**
 * A local integration's row (the "Runs" line design section 4): **Folder**, **Runs** for this
 * computer, **Reaches** with each address, a setting's with where its value comes from (R9), and
 * **Gets secrets** with where each may go. Only local integrations are in the check: built-in
 * ones aren't in the trust content, whatever a sheet says about itself. A host the assistant added
 * that the person didn't name carries {@link assistantAddedMark}.
 *
 * @param assistantAdded - the assistant-added hosts as the profile's review folder records them
 */
export function integrationRow(
  integration: IntegrationTrustContent,
  runs: IntegrationRuns,
  assistantAdded: AssistantAddedHosts = new Map(),
): TrustRowView {
  const marked = assistantAddedIn(
    assistantAdded,
    integration.folder,
    Object.keys(integration.hosts),
  );
  const reaches = Object.entries(integration.hosts).map(([host, addressClass]) => {
    const setting = settingNameOf(host);
    if (setting === undefined) {
      return marked.has(host) ? `${host} · ${assistantAddedMark}` : host;
    }
    return settingReach(
      integration.id,
      setting,
      integration.addresses[setting] ?? null,
      addressClass,
    );
  });
  const secrets = integration.secrets.map(
    (secret) =>
      `${secretName(secret.secret)} → ${secret.hosts.map((host) => secretHost(integration, host)).join(", ")}`,
  );
  return {
    id: integration.id,
    detail: "",
    flag: runs?.state === "not-fenced" ? integrationNotFencedFlag : undefined,
    lines: [
      ["Folder", `${integration.folder}/`],
      ...runsLines(runs),
      ...labelled("Reaches", reaches),
      ...labelled("Gets secrets", secrets),
    ],
  };
}

/**
 * The label before each host, secret or tool a changed integration has that it didn't have when it
 * was trusted, such as "New: can also reach cdn.shopify.com" (HAL-511, until the copy check).
 */
export const newAdditionLabel = "New:";

/**
 * A changed local integration's row: first a {@link newAdditionLabel} line for each host, secret
 * and tool it has now that it didn't have when it was trusted, then its row as it is now. What it
 * no longer has gets no line (HAL-65 decision 9).
 */
export function changedIntegrationRow(
  changed: ChangedIntegration,
  runs: IntegrationRuns,
  assistantAdded?: AssistantAddedHosts,
): TrustRowView {
  const row = integrationRow(changed.after, runs, assistantAdded);
  const added = integrationAdditions(changed);
  const lines = [
    ...added.hosts.map((host) => `can also reach ${newHost(host)}`),
    ...added.secrets.map((secret) => `can also get the secret ${secretName(secret)}`),
    ...added.tools.map((tool) => `can also offer the tool ${tool}`),
  ].map((text) => [newAdditionLabel, text] as const);
  return { ...row, lines: [...lines, ...row.lines] };
}

/** A host the integration may reach now: its name, or the setting that holds the address. */
function newHost(host: string): string {
  const setting = settingNameOf(host);
  return setting === undefined ? host : `the address in the setting ${setting}`;
}

/**
 * The Runs row and the lines under it; none while the host can't say. Where it isn't in the
 * sandbox, Runs is in design section 4's amber form with the triangle; the reason and fix under it
 * stay plain (C592).
 */
function runsLines(runs: IntegrationRuns): TrustRowView["lines"] {
  switch (runs?.state) {
    case "checking":
      return [["Runs", integrationRunsChecking]];
    case "fenced":
      return [["Runs", integrationRunsFenced]];
    case "not-fenced": {
      const words = runnerUnfencedWords(runs.reason, "integration");
      return [
        ["Runs", integrationRunsUnfenced, "warning"],
        ["", words.reason],
        ["", words.fix],
        // R6 in place of the checkbox, once the yes for this reason is saved.
        ...(runs.allowedOn === undefined
          ? []
          : [["", unfencedAllowedLine(runs.allowedOn)] as const]),
      ];
    }
    case undefined:
      return [];
  }
}

/** The label on the first line only, as Allowed sites has it. */
function labelled(label: string, values: readonly string[]): (readonly [string, string])[] {
  return values.map((value, index) => [index === 0 ? label : "", value] as const);
}

/** The setting a `‹setting NAME›` host reads, else `undefined` for a host name. */
function settingNameOf(host: string): string | undefined {
  return /^‹setting (.+)›$/u.exec(host)?.[1];
}

const addressClassWords: Record<string, string> = {
  private: "only on your home network",
  loopback: "only on this computer",
  public: "any public address",
};

/**
 * An address from a setting, in the workspace's form of R9: the value and where it comes from, or
 * that it isn't set yet. The workspace's settings can arrive filled in with a clone.
 */
function settingReach(
  id: string,
  setting: string,
  address: string | null,
  addressClass: string,
): string {
  const where = `the workspace's settings for ${id}`;
  const limit = addressClassWords[addressClass] ?? addressClass;
  if (address === null) return `Not set yet, in ${where} · ${limit}`;
  return `${settingAddress(address)} (from ${where}: ${setting} · ${limit})`;
}

/** Where a secret may go: a host name, or the address a setting holds. */
function secretHost(integration: IntegrationTrustContent, host: string): string {
  const setting = settingNameOf(host);
  if (setting === undefined) return host;
  const address = integration.addresses[setting] ?? null;
  return address === null ? `the address in the setting ${setting}` : settingAddress(address);
}

function settingAddress(address: string | null): string {
  if (address === null) return "not set";
  const refused = /^‹refused: (.+)›$/u.exec(address)?.[1];
  return refused === undefined ? address : `can't be used: ${refused}`;
}

/** A secret's name from its `‹secret NAME›` reference. */
export function secretName(reference: string): string {
  return /^‹secret (.+)›$/u.exec(reference)?.[1] ?? reference;
}
