import type { Path } from "@halonicjs/schema-kit";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import {
  GOOGLE_CHECK_URL_PATTERN,
  GOOGLE_SECRET,
  type IntegrationHost,
  IntegrationSheet,
} from "./schema.ts";

/**
 * `integration.yaml`, next to an integration's code. It isn't a workspace
 * file, so it has no place; the loader for integrations reads it.
 */
export const integrationKind: FileKind<IntegrationSheet> = {
  name: "integration",
  about: "An integration's permission sheet: its hosts, secrets, tools and limits.",
  syntax: "yaml",
  schema: IntegrationSheet,
  places: [],
  idFromPlace: "none",
  check: checkIntegrationSheet,
};

/**
 * The rules over several fields: no list names a thing twice, a secret goes
 * only to hosts the sheet declares, and the Google fields fit the sheet.
 *
 * @example
 * checkIntegrationSheet(sheet); // [] for the weather example in the guide
 */
export function checkIntegrationSheet(sheet: IntegrationSheet): KindCheckProblem[] {
  const problems: KindCheckProblem[] = [];
  const duplicates = (values: readonly string[], path: Path, what: string) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        problems.push({
          severity: "error",
          code: "duplicate",
          path: [...path, index],
          message: `Integration "${sheet.id}": ${what} ${value} is listed twice`,
        });
      }
      seen.add(value);
    });
  };
  duplicates(sheet.provides, ["provides"], "provides");
  duplicates(sheet.hosts.map(hostKey), ["hosts"], "host");
  duplicates(sheet.googleScopes?.map((entry) => entry.scope) ?? [], ["googleScopes"], "scope");
  duplicates(sheet.googleApis?.map((entry) => entry.api) ?? [], ["googleApis"], "API");
  duplicates(
    sheet.tokens.map((token) => token.name),
    ["tokens"],
    "token",
  );
  duplicates(
    sheet.tools.map((tool) => tool.name),
    ["tools"],
    "tool",
  );
  duplicates(sheet.needs, ["needs"], "need");
  const recording = sheet.recording;
  duplicates(recording?.userContent ?? [], ["recording", "userContent"], "path");
  duplicates(recording?.secretFields ?? [], ["recording", "secretFields"], "field");
  duplicates(recording?.allowContentTypes ?? [], ["recording", "allowContentTypes"], "type");

  const declared = new Set(sheet.hosts.map(hostKey));
  for (const [name, secret] of Object.entries(sheet.secrets)) {
    duplicates(secret.hosts.map(hostKey), ["secrets", name, "hosts"], "host");
    secret.hosts.forEach((host, index) => {
      if (!declared.has(hostKey(host))) {
        problems.push({
          severity: "error",
          code: "secret-host-not-declared",
          path: ["secrets", name, "hosts", index],
          message: `Integration "${sheet.id}": secret "${name}" may only go to hosts in hosts, and ${hostKey(host)} isn't one`,
        });
      }
    });
  }
  problems.push(...checkGoogleFields(sheet));
  return problems;
}

/** The sheet fields that only an integration using the Google sign-in may have. */
const googleFields = ["googleScopes", "googleApis", "googleCheck"] as const;

/**
 * The Google fields belong to a sheet with the `google-account` secret. A
 * sheet that asks for scopes names the APIs to switch on, and `googleCheck`
 * carries the token, so it goes to a host of the sheet and of that secret.
 * The same rules as the `google-sheet` check in halonic-com/integrations.
 */
function checkGoogleFields(sheet: IntegrationSheet): KindCheckProblem[] {
  const secret = Object.hasOwn(sheet.secrets, GOOGLE_SECRET)
    ? sheet.secrets[GOOGLE_SECRET]
    : undefined;
  if (secret === undefined) {
    return googleFields
      .filter((field) => sheet[field] !== undefined)
      .map((field) => ({
        severity: "error",
        code: "google-field-without-sign-in",
        path: [field],
        message: `Integration "${sheet.id}": ${field} is only for an integration with the ${GOOGLE_SECRET} secret. Remove it, or add the secret`,
      }));
  }
  const problems: KindCheckProblem[] = [];
  if (sheet.googleScopes !== undefined && (sheet.googleApis ?? []).length === 0) {
    problems.push({
      severity: "error",
      code: "google-apis-missing",
      path: ["googleScopes"],
      message: `Integration "${sheet.id}": a sheet with googleScopes also lists googleApis, { api, name } for each API the user switches on, such as { api: gmail.googleapis.com, name: Gmail API }`,
    });
  }
  const url = sheet.googleCheck?.url;
  const host = url === undefined ? undefined : GOOGLE_CHECK_URL_PATTERN.exec(url)?.[1];
  if (host !== undefined) {
    const inSheet = sheet.hosts.some((declared) => declared === host);
    const inSecret = secret.hosts.some((declared) => declared === host);
    if (!inSheet || !inSecret) {
      problems.push({
        severity: "error",
        code: "google-check-host-not-declared",
        path: ["googleCheck", "url"],
        message: `Integration "${sheet.id}": googleCheck carries the ${GOOGLE_SECRET} token, so ${host} must be in hosts and in that secret's hosts`,
      });
    }
  }
  return problems;
}

/** A host as one text, to compare: `api.example.com`, or `fromSetting url`. */
function hostKey(host: IntegrationHost): string {
  return typeof host === "string" ? host : `fromSetting ${host.fromSetting}`;
}
