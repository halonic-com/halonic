import {
  type IntegrationPolicy,
  type IntegrationSheet,
  integrationPolicy,
  parseIntegrationSheet,
} from "@halonicjs/format/integration";
import {
  type LoadedIntegration,
  type LoadProblem,
  loadIntegration,
} from "@halonicjs/integration-kit";
import type { HttpClient, TokenStore } from "@halonicjs/ports";
import { canarySecrets } from "./canaries.ts";
import { fail } from "./failure.ts";
import type { ConformanceSubject } from "./run.ts";

/**
 * Loads the subject the way Halonic does, through the kit's loader, with a
 * canary for every secret in its sheet and every need available. Fails the
 * check with each problem the loader found.
 */
export function loadSubject(
  subject: ConformanceSubject,
  transport: HttpClient,
  tokens: TokenStore = emptyTokens,
): LoadedIntegration {
  const sheet = sheetOf(subject);
  const loaded = loadIntegration({
    source: { origin: "built-in", sheet: subject.sheet, integration: subject.integration },
    choices: {
      settings: subject.settings ?? {},
      // The canary store answers by name, so each secret is picked as itself.
      secretNames: Object.fromEntries(Object.keys(sheet.secrets).map((name) => [name, name])),
    },
    transport,
    secrets: canarySecrets,
    tokens,
    capabilities: sheet.needs,
  });
  return loaded.ok ? loaded.value : fail(problemsText(loaded.error));
}

/** The subject's sheet, checked. Fails the check when it doesn't pass. */
export function sheetOf(subject: ConformanceSubject): IntegrationSheet {
  const parsed = parseIntegrationSheet(subject.sheet);
  return parsed.ok ? parsed.value : fail(`the sheet is invalid:\n${problemsText(parsed.error)}`);
}

/** What the kit enforces for the subject, with its settings. Fails the check when a host doesn't resolve. */
export function policyOf(subject: ConformanceSubject): IntegrationPolicy {
  const resolved = integrationPolicy(sheetOf(subject), subject.settings ?? {});
  return resolved.ok ? resolved.value.policy : fail(problemsText(resolved.error));
}

function problemsText(problems: readonly LoadProblem[]): string {
  return problems
    .map(({ code, path, message }) => `${message} (${code} at ${path.join(".") || "the sheet"})`)
    .join("\n");
}

const emptyTokens: TokenStore = {
  get: async () => null,
  set: async () => {},
  remove: async () => {},
};
