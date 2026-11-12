import type { Path } from "@halonicjs/schema-kit";
import type { KindCheckProblem } from "../../kind.ts";
import { hostKey } from "./host-key.ts";
import { type IntegrationSheet, type IntegrationSignIn, isPlacedSecret } from "./schema.ts";
import {
  fixedSignInUrl,
  queryParameterNames,
  RESERVED_AUTHORIZE_PARAMETERS,
} from "./sign-in-urls.ts";

/** The first `kit` that has `signIns`. */
const SIGN_IN_KIT = 2;

/** The URL fields of a sign-in, with whether a query is allowed on each. */
const URL_FIELDS = [
  { field: "authorizeUrl", query: true },
  { field: "tokenUrl", query: false },
  { field: "revokeUrl", query: false },
  { field: "issuer", query: false },
] as const;

/**
 * The rules over a sheet's `signIns` and their client secrets: the sheet
 * says `kit: 2`; the access token goes only to hosts the sheet declares; a
 * `{ fromSetting }` URL reads a public host the sheet declares; Halonic's own
 * authorize parameters stay Halonic's; and a client secret has no hosts of
 * its own and belongs to exactly one sign-in.
 *
 * @example
 * checkSignIns(sheet); // [] for a sheet without signIns
 */
export function checkSignIns(sheet: IntegrationSheet): KindCheckProblem[] {
  const entries = Object.entries(sheet.signIns);
  const problems = [...kitProblems(sheet, entries.length)];
  for (const [name, signIn] of entries) {
    problems.push(...accessHostProblems(sheet, name, signIn), ...urlProblems(sheet, name, signIn));
  }
  problems.push(...clientSecretProblems(sheet));
  return problems;
}

/** A problem in the sheet, with the sheet's name in front of the message. */
function problemAt(
  sheet: IntegrationSheet,
  code: string,
  path: Path,
  message: string,
): KindCheckProblem {
  return { severity: "error", code, path, message: `Integration "${sheet.id}": ${message}` };
}

function kitProblems(sheet: IntegrationSheet, signInCount: number): KindCheckProblem[] {
  if (signInCount === 0 || sheet.kit >= SIGN_IN_KIT) {
    return [];
  }
  const message = `signIns need kit: ${SIGN_IN_KIT} or higher, and this sheet says kit: ${sheet.kit}. Set kit: ${SIGN_IN_KIT}`;
  return [problemAt(sheet, "sign-ins-need-kit-2", ["kit"], message)];
}

/** The access token goes only to hosts the sheet declares, as a secret does. */
function accessHostProblems(
  sheet: IntegrationSheet,
  name: string,
  signIn: IntegrationSignIn,
): KindCheckProblem[] {
  const declared = new Set(sheet.hosts.map(hostKey));
  return signIn.access.hosts.flatMap((host, index) =>
    declared.has(hostKey(host))
      ? []
      : [
          problemAt(
            sheet,
            "sign-in-host-not-declared",
            ["signIns", name, "access", "hosts", index],
            `the sign-in "${name}" may only send its token to hosts in hosts, and ${hostKey(host)} isn't one`,
          ),
        ],
  );
}

/** Each URL reads a public setting host, carries a query only where allowed, and leaves Halonic's parameters alone. */
function urlProblems(
  sheet: IntegrationSheet,
  name: string,
  signIn: IntegrationSignIn,
): KindCheckProblem[] {
  const publicSettings = new Set(
    sheet.hosts.flatMap((host) =>
      typeof host !== "string" && host.class === "public" ? [host.fromSetting] : [],
    ),
  );
  const problems: KindCheckProblem[] = [];
  for (const { field, query } of URL_FIELDS) {
    const url = signIn[field];
    if (url === undefined) {
      continue;
    }
    const path = ["signIns", name, field];
    if (typeof url !== "string" && !publicSettings.has(url.fromSetting)) {
      problems.push(
        problemAt(
          sheet,
          "sign-in-setting-not-public",
          path,
          `the sign-in "${name}" reads its ${field} from the setting "${url.fromSetting}", which must be a host in hosts with class: public`,
        ),
      );
    }
    const queryText = fixedSignInUrl(url)?.query ?? "";
    if (!query && queryText !== "") {
      problems.push(
        problemAt(
          sheet,
          "sign-in-url-query",
          path,
          `the ${field} of "${name}" can't carry a query`,
        ),
      );
    }
    const reserved = query ? reservedIn(queryText) : [];
    for (const parameter of reserved) {
      problems.push(
        problemAt(
          sheet,
          "sign-in-reserved-parameter",
          path,
          `the authorizeUrl of "${name}" sets ${parameter}, which Halonic sets itself`,
        ),
      );
    }
  }
  return problems;
}

/**
 * A client secret is declared without `hosts` and `as`, named by exactly one
 * sign-in, and every such secret is named by one.
 */
function clientSecretProblems(sheet: IntegrationSheet): KindCheckProblem[] {
  const problems: KindCheckProblem[] = [];
  const namedBy = new Map<string, string[]>();
  for (const [name, signIn] of Object.entries(sheet.signIns)) {
    const secret = signIn.clientSecret;
    if (secret === undefined) {
      continue;
    }
    namedBy.set(secret, [...(namedBy.get(secret) ?? []), name]);
    const problem = clientSecretKindProblem(sheet, name, secret);
    if (problem !== undefined) {
      problems.push(problem);
    }
  }
  for (const [secret, signIns] of namedBy) {
    if (signIns.length > 1) {
      problems.push(
        problemAt(
          sheet,
          "client-secret-shared",
          ["secrets", secret],
          `the client secret "${secret}" is named by ${signIns.length} sign-ins (${signIns.join(", ")}); give each its own`,
        ),
      );
    }
  }
  for (const [name, secret] of Object.entries(sheet.secrets)) {
    if (!isPlacedSecret(secret) && !namedBy.has(name)) {
      problems.push(
        problemAt(
          sheet,
          "client-secret-unused",
          ["secrets", name],
          `the secret "${name}" has no hosts and no "as", so it must be the clientSecret of a sign-in, and none names it`,
        ),
      );
    }
  }
  return problems;
}

function clientSecretKindProblem(
  sheet: IntegrationSheet,
  signIn: string,
  secret: string,
): KindCheckProblem | undefined {
  const entry = Object.hasOwn(sheet.secrets, secret) ? sheet.secrets[secret] : undefined;
  const path = ["signIns", signIn, "clientSecret"];
  if (entry === undefined) {
    return problemAt(
      sheet,
      "client-secret-not-declared",
      path,
      `the sign-in "${signIn}" names the client secret "${secret}", which secrets doesn't declare`,
    );
  }
  return isPlacedSecret(entry)
    ? problemAt(
        sheet,
        "client-secret-has-hosts",
        path,
        `the client secret "${secret}" of "${signIn}" must have no hosts and no "as": it goes only to the sign-in's token and revoke hosts`,
      )
    : undefined;
}

/** The reserved parameter names a query sets, each once. */
function reservedIn(query: string): string[] {
  const set = new Set(queryParameterNames(query));
  return RESERVED_AUTHORIZE_PARAMETERS.filter((name) => set.has(name));
}
