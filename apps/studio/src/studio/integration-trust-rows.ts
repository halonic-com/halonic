// The workspace trust check's Integrations section (the "Runs" line design section 4, HAL-1873;
// microcopy 24.1 R4, R9, R11 and R12): one row per local integration, in the CLI's content.

import { type RunnerUnfencedReason, runnerUnfencedWords } from "@halonicjs/app";
import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import type { IntegrationTrustContent } from "@halonicjs/workspace";

/**
 * Whether integration code runs in the sandbox on this computer, as the host says when the check
 * opens (the "Runs" line design section 4, HAL-1873): `checking` while it answers, `undefined`
 * where it can't say, which leaves the Runs row out.
 */
export type IntegrationRuns =
  | { readonly state: "checking" }
  | { readonly state: "fenced" }
  | { readonly state: "not-fenced"; readonly reason: RunnerUnfencedReason }
  | undefined;

/** The Integrations section's line under its heading (microcopy 24.1 R12). */
export const integrationsIntro =
  "Code in this workspace that connects to a service. It runs apart from Studio.";

/** An integration's Runs row in the sandbox (R12). */
export const integrationRunsFenced =
  "On its own, with no access to your files or other programs. It can only reach the addresses and use the secrets listed here.";

/**
 * An integration's Runs row where the sandbox can't start: R11's first sentence, because nothing
 * starts a local integration without the sandbox yet (Liam, HAL-3384 part 6, option A).
 */
export const integrationRunsOff = "Doesn't start on this computer: the sandbox can't start here.";

/** The Runs row while the host answers (R4). */
export const integrationRunsChecking = "Checking the sandbox on this computer…";

/**
 * A local integration's row (the "Runs" line design section 4): **Folder**, **Runs** for this
 * computer, **Reaches** with each address, a setting's with where its value comes from (R9), and
 * **Gets secrets** with where each may go. Only local integrations are in the check: built-in
 * ones aren't in the trust content, whatever a sheet says about itself.
 */
export function integrationRow(
  integration: IntegrationTrustContent,
  runs: IntegrationRuns,
): TrustRowView {
  const reaches = Object.entries(integration.hosts).map(([host, addressClass]) => {
    const setting = settingNameOf(host);
    return setting === undefined
      ? host
      : settingReach(integration.id, setting, integration.addresses[setting] ?? null, addressClass);
  });
  const secrets = integration.secrets.map(
    (secret) =>
      `${secretName(secret.secret)} → ${secret.hosts.map((host) => secretHost(integration, host)).join(", ")}`,
  );
  return {
    id: integration.id,
    detail: "",
    lines: [
      ["Folder", `${integration.folder}/`],
      ...runsLines(runs),
      ...labelled("Reaches", reaches),
      ...labelled("Gets secrets", secrets),
    ],
  };
}

/** The Runs row and the lines under it; none while the host can't say. */
function runsLines(runs: IntegrationRuns): (readonly [string, string])[] {
  switch (runs?.state) {
    case "checking":
      return [["Runs", integrationRunsChecking]];
    case "fenced":
      return [["Runs", integrationRunsFenced]];
    case "not-fenced": {
      const words = runnerUnfencedWords(runs.reason, "integration");
      return [
        ["Runs", integrationRunsOff],
        ["", words.reason],
        ["", words.fix],
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
