import type { Path } from "@halonicjs/schema-kit";
import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { type IntegrationHost, IntegrationSheet } from "./schema.ts";

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
 * The rules over several fields: no list names a thing twice, and a secret
 * goes only to hosts the sheet declares.
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
  duplicates(sheet.googleScopes ?? [], ["googleScopes"], "scope");
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
  return problems;
}

/** A host as one text, to compare: `api.example.com`, or `fromSetting url`. */
function hostKey(host: IntegrationHost): string {
  return typeof host === "string" ? host : `fromSetting ${host.fromSetting}`;
}
