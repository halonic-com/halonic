import type { Path } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import { type PolicyProblem, resolveHost, resolveSignIns, settingClasses } from "./policy.ts";
import {
  CLIENT_ID_PATTERN,
  type IntegrationSheet,
  type IntegrationSignIn,
  type IntegrationSignInUrl,
} from "./schema.ts";

/**
 * A sign-in with every setting filled in, as the trust check shows it and as
 * Halonic saves it with the grant. It has the shape of `ApprovedSignIn` in
 * `core/oauth-sign-in`, which this package can't import; the host passes it
 * on as it is. It holds no secret: `clientSecretName` is a name.
 */
export interface ResolvedSignIn {
  readonly flow: "oauth-code";
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl?: string;
  /** Only ever `true`: a sign-in that doesn't say so is left without the key. */
  readonly revokeEndsClientGrants?: true;
  readonly issuer?: string;
  readonly clientId: string;
  readonly clientAuth: "post" | "basic";
  readonly clientSecretName?: string;
  readonly scopes: readonly string[];
  readonly accessHosts: readonly string[];
  readonly as: "bearer" | "header";
  readonly header?: string;
  readonly prefix?: string;
}

/** Why a sign-in's client ID can't be resolved. */
export type ClientIdProblem = PolicyProblem & {
  readonly code: "client-id-missing" | "client-id-invalid";
};

/** What {@link resolveSignIn} needs from its caller, who already checked the hosts. */
export interface SignInResolution {
  readonly sheetId: string;
  readonly settings: Readonly<Record<string, unknown>>;
  /** The host a `{ fromSetting }` URL reads, `host[:port]`; undefined when the setting is a problem, which it reports. */
  readonly hostOfSetting: (setting: string, path: Path) => string | undefined;
  /** The hosts the access token may go to, already resolved. */
  readonly accessHosts: readonly string[];
  readonly path: Path;
  readonly report: (problem: ClientIdProblem) => void;
}

/**
 * Fills in one sign-in: its URLs (a `{ fromSetting, path }` URL becomes
 * `https://host/path`), its client ID, and its scopes as plain words.
 *
 * @returns the resolved sign-in, or undefined when a setting it reads is
 *   missing or invalid; the reason is then passed to `report`
 *
 * @example
 * resolveSignIn(signIn, resolution); // { tokenUrl: "https://git.example.com/oauth/token", … }
 */
export function resolveSignIn(
  signIn: IntegrationSignIn,
  resolution: SignInResolution,
): ResolvedSignIn | undefined {
  const urlOf = (url: IntegrationSignInUrl, field: string): string | undefined => {
    if (typeof url === "string") {
      return url;
    }
    const host = resolution.hostOfSetting(url.fromSetting, [...resolution.path, field]);
    return host === undefined ? undefined : `https://${host}${url.path ?? ""}`;
  };
  const authorizeUrl = urlOf(signIn.authorizeUrl, "authorizeUrl");
  const tokenUrl = urlOf(signIn.tokenUrl, "tokenUrl");
  const revokeUrl =
    signIn.revokeUrl === undefined ? undefined : urlOf(signIn.revokeUrl, "revokeUrl");
  const issuer = signIn.issuer === undefined ? undefined : urlOf(signIn.issuer, "issuer");
  const clientId = clientIdOf(signIn, resolution);
  const complete =
    authorizeUrl !== undefined &&
    tokenUrl !== undefined &&
    clientId !== undefined &&
    (signIn.revokeUrl === undefined || revokeUrl !== undefined) &&
    (signIn.issuer === undefined || issuer !== undefined);
  if (!complete) {
    return undefined;
  }
  return {
    flow: signIn.flow,
    authorizeUrl,
    tokenUrl,
    ...(revokeUrl === undefined ? {} : { revokeUrl }),
    ...(signIn.revokeEndsClientGrants === true ? { revokeEndsClientGrants: true as const } : {}),
    ...(issuer === undefined ? {} : { issuer }),
    clientId,
    clientAuth: signIn.clientAuth,
    ...(signIn.clientSecret === undefined ? {} : { clientSecretName: signIn.clientSecret }),
    scopes: signIn.scopes.map((entry) => entry.scope),
    accessHosts: resolution.accessHosts,
    as: signIn.access.as,
    ...(signIn.access.as === "header"
      ? {
          header: signIn.access.header,
          ...(signIn.access.prefix === undefined ? {} : { prefix: signIn.access.prefix }),
        }
      : {}),
  };
}

function clientIdOf(signIn: IntegrationSignIn, resolution: SignInResolution): string | undefined {
  if (typeof signIn.clientId === "string") {
    return signIn.clientId;
  }
  const { fromSetting } = signIn.clientId;
  const path = [...resolution.path, "clientId"];
  const value = Object.hasOwn(resolution.settings, fromSetting)
    ? resolution.settings[fromSetting]
    : undefined;
  if (typeof value !== "string" || value === "") {
    resolution.report({
      code: "client-id-missing",
      path,
      message: `${resolution.sheetId}: the setting "${fromSetting}" must hold the sign-in's client ID`,
    });
    return undefined;
  }
  if (!CLIENT_ID_PATTERN.test(value)) {
    resolution.report({
      code: "client-id-invalid",
      path,
      message: `${resolution.sheetId}: the setting "${fromSetting}" must hold a client ID without spaces or line breaks`,
    });
    return undefined;
  }
  return value;
}

/**
 * Fills in each sign-in of a sheet from the integration's settings.
 *
 * @param declared - what `integrationPolicy` resolved, for the access hosts
 * @param report - called with each client ID problem
 * @param hostOfSetting - the host a `{ fromSetting }` URL reads, or undefined
 *   when the setting is a problem, which it has already reported
 */
function approveEach(
  sheet: IntegrationSheet,
  settings: Readonly<Record<string, unknown>>,
  declared: Readonly<Record<string, { readonly hosts: readonly string[] }>>,
  report: SignInResolution["report"],
  hostOfSetting: SignInResolution["hostOfSetting"],
): Record<string, ResolvedSignIn> {
  const approved: Record<string, ResolvedSignIn> = {};
  for (const [name, signIn] of Object.entries(sheet.signIns)) {
    const resolved = resolveSignIn(signIn, {
      sheetId: sheet.id,
      settings,
      path: ["signIns", name],
      accessHosts: declared[name]?.hosts ?? [],
      hostOfSetting,
      report,
    });
    if (resolved !== undefined) {
      approved[name] = resolved;
    }
  }
  return approved;
}

/**
 * Each sign-in of the sheet with its settings filled in, by name: what the
 * user approves. Apart from `integrationPolicy`, which the kit can use
 * before the client ID setting is set.
 *
 * @example
 * approvedSignIns(sheet, { clientId: "abc123" }); // ok: { "example-account": { … } }
 */
export function approvedSignIns(
  sheet: IntegrationSheet,
  settings: Readonly<Record<string, unknown>>,
): Result<Record<string, ResolvedSignIn>, PolicyProblem[]> {
  const problems: PolicyProblem[] = [];
  const classes = settingClasses(sheet);
  const declared = resolveSignIns(sheet, classes, settings, problems);
  const approved = approveEach(
    sheet,
    settings,
    declared,
    (problem) => problems.push(problem),
    // The sheet's checks keep a sign-in's address setting in class `public`,
    // and `resolveHost` refuses plain http there, so the host is always https.
    (setting, path) =>
      resolveHost(sheet, { fromSetting: setting }, classes, settings, path, problems)?.host,
  );
  return problems.length > 0 ? err(problems) : ok(approved);
}
