// The permission sheet, `integration.yaml`. This folder imports only
// schema-kit, so the integration kit and the conformance suite can use the
// sheet without the YAML reader.
import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * Lower-case words joined by `-`: the integration's id and its secret and
 * token names. The same rule as the kit's `namePattern`.
 */
export const INTEGRATION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const name = s
  .string()
  .regex(INTEGRATION_NAME_PATTERN, "use lower-case words joined by '-', such as 'weather-key'");

/**
 * A host name in lower case, with at least one dot and a top-level name of
 * letters, and an optional `:port`. No scheme, no path, no wildcards and no
 * IP addresses: a host the user picks is `{ fromSetting }` instead.
 */
export const HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?$/;

const fixedHost = s
  .string()
  .regex(
    HOST_PATTERN,
    "use an exact lower-case host name with an optional :port, such as 'api.example.com'",
  );

/**
 * Where the host of a `{ fromSetting }` URL may be, which the sheet declares
 * so the trust check can say it before the setting is filled in:
 * - `loopback`: only on this computer (`localhost`, `127.0.0.0/8`, `::1`);
 * - `private`: only on the home network, as a private IP address;
 * - `public`: any public host name, over `https`.
 *
 * `integrationPolicy` refuses a setting whose URL is outside the class.
 */
export const ADDRESS_CLASSES = ["loopback", "private", "public"] as const;

/** One of {@link ADDRESS_CLASSES}. */
export type AddressClass = (typeof ADDRESS_CLASSES)[number];

/** A fixed host, or the host of the URL in one of the integration's settings, with its class. */
const Host = s.union([
  fixedHost,
  s.object({ fromSetting: s.string().min(1), class: s.enum(ADDRESS_CLASSES) }).strict(),
]);

/** A host as the sheet writes it in `hosts`. */
export type IntegrationHost = Infer<typeof Host>;

/**
 * A host a secret may go to: a fixed host, or a `{ fromSetting }` host from
 * `hosts`, named by its setting. The class stays with the one in `hosts`.
 */
const SecretHost = s.union([fixedHost, s.object({ fromSetting: s.string().min(1) }).strict()]);

/** A host as the sheet writes it in a secret's `hosts`. */
export type IntegrationSecretHost = Infer<typeof SecretHost>;

/**
 * What every secret says, wherever the kit puts it. A plugin's local tool
 * declares its secrets with these fields, without `as`.
 */
export const secretFields = {
  /** Why the integration needs it, in words the user understands. */
  purpose: s.string().min(1),
  /** The hosts it may go to. Each must be in the sheet's `hosts`. */
  hosts: s.array(SecretHost).min(1),
  /** Sent only when the workspace has set it up; without it the request goes out bare. */
  optional: s.boolean().default(false),
};

/** An HTTP header name. */
const headerName = s.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/, "use an HTTP header name");

/**
 * A sign-in's client secret. It has no `hosts` and no `as`: the sign-in that
 * names it in `clientSecret` gives it its hosts (its `tokenUrl` and
 * `revokeUrl`), and the integration can't place it at all.
 */
const ClientSecret = s
  .object({ purpose: s.string().min(1), as: s.literal(undefined).optional() })
  .strict();

/**
 * One entry of `secrets`, told apart by `as`: a secret the integration
 * places and where the kit puts it, as `SecretPlacement` in the ports says
 * (`bearer`, `header` or `form`), or, with no `as`, a client secret.
 */
const Secret = s.discriminatedUnion("as", [
  s.object({ ...secretFields, as: s.literal("bearer") }).strict(),
  s
    .object({
      ...secretFields,
      as: s.literal("header"),
      header: headerName,
      prefix: s.string().optional(),
    })
    .strict(),
  s.object({ ...secretFields, as: s.literal("form"), field: s.string().min(1) }).strict(),
  ClientSecret,
]);

/** One entry of `secrets`, with `optional` filled in. */
export type IntegrationSecretEntry = Infer<typeof Secret>;

/** A secret the integration places. */
export type IntegrationSecret = Extract<IntegrationSecretEntry, { as: string }>;

/** A sign-in's client secret, as the sheet writes it. */
export type IntegrationClientSecret = Exclude<IntegrationSecretEntry, IntegrationSecret>;

/**
 * Whether a `secrets` entry is one the integration places. The other kind is
 * a client secret, which only Halonic's sign-in code reads.
 */
export function isPlacedSecret(entry: IntegrationSecretEntry): entry is IntegrationSecret {
  return entry.as !== undefined;
}

/**
 * The secrets of a sheet the integration places, by name: `secrets` without
 * the client secrets, which have no hosts or placement to show.
 */
export function placedSecrets(
  secrets: Readonly<Record<string, IntegrationSecretEntry>>,
): [string, IntegrationSecret][] {
  return Object.entries(secrets).flatMap(([name, entry]): [string, IntegrationSecret][] =>
    isPlacedSecret(entry) ? [[name, entry]] : [],
  );
}

/** One OAuth scope: a token of visible ASCII without a space, `"` or `\\` (RFC 6749, section 3.3). */
const SCOPE_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/;

/** A path inside a sign-in URL's host: `/`, then anything but a space, `?` or `#`. */
const urlPath = s.string().regex(/^\/[^\s?#]*$/, "start the path with '/', such as '/oauth/token'");

/** Visible ASCII, so a client ID can't carry a line break or a space. */
const CLIENT_ID_PATTERN = /^[\x21-\x7e]{1,256}$/;

/**
 * An `https` URL for a sign-in: `https://host[:port]/path?query` with an
 * exact host, no user name, password or `#fragment`. The host is the first
 * group, so the sheet's checks can hold it against `hosts`. Plain `http` is
 * never allowed, not even to this machine.
 */
export const SIGN_IN_URL_PATTERN = new RegExp(
  `^https://(${HOST_PATTERN.source.slice(1, -1)})(?:/[^\\s?#]*)?(?:\\?[^\\s#]*)?$`,
);

/**
 * Where a sign-in endpoint is: a fixed `https` URL, or the host of the URL in
 * one of the integration's settings plus a fixed path, for a self-hosted
 * service such as GitLab. That setting must be a `public` host in `hosts`.
 */
const SignInUrl = s.union([
  s
    .string()
    .regex(
      SIGN_IN_URL_PATTERN,
      "use an https URL with an exact host, such as 'https://auth.example.com/oauth/token'",
    ),
  s.object({ fromSetting: s.string().min(1), path: urlPath.optional() }).strict(),
]);

/** A sign-in endpoint as the sheet writes it. */
export type IntegrationSignInUrl = Infer<typeof SignInUrl>;

/** One scope the sign-in asks for, and why, in words the user reads. */
const SignInScope = s
  .object({
    scope: s.string().regex(SCOPE_PATTERN, "use one OAuth scope, without spaces"),
    /** Shown to the user as it is. */
    reason: s.string().regex(/\S/, "say why the integration needs the scope"),
  })
  .strict();

/** Where the sign-in's access token goes: the hosts, and how the kit puts it in. */
const SignInAccess = s.discriminatedUnion("as", [
  s.object({ hosts: s.array(SecretHost).min(1), as: s.literal("bearer") }).strict(),
  s
    .object({
      hosts: s.array(SecretHost).min(1),
      as: s.literal("header"),
      header: headerName,
      prefix: s.string().optional(),
    })
    .strict(),
]);

/** Where a sign-in's access token goes, as the sheet writes it. */
export type IntegrationSignInAccess = Infer<typeof SignInAccess>;

/**
 * A sign-in: an OAuth 2.0 flow that Halonic's own code runs, and where the
 * access token may go. The integration can use the token (`{ signIn }` in
 * `auth`) but never read it. Needs `kit: 2`.
 */
const SignIn = s
  .object({
    /** What the sign-in is for, in words the user understands. */
    purpose: s.string().min(1),
    /** Authorization code with PKCE (S256) and a loopback redirect: the only flow so far. */
    flow: s.literal("oauth-code"),
    /** May carry extra query parameters; the ones Halonic sets itself are refused by the sheet check. */
    authorizeUrl: SignInUrl,
    tokenUrl: SignInUrl,
    /** RFC 7009. Without it, signing out only forgets the tokens. */
    revokeUrl: SignInUrl.optional(),
    /** Checked against the `iss` of the redirect (RFC 9207). */
    issuer: SignInUrl.optional(),
    /** A fixed ID, or a setting: never a secret, since OAuth sends it in the browser's address bar. */
    clientId: s.union([
      s.string().regex(CLIENT_ID_PATTERN, "use the client ID without spaces"),
      s.object({ fromSetting: s.string().min(1) }).strict(),
    ]),
    /** A secret of this sheet without `hosts`; a public client leaves it out and uses PKCE only. */
    clientSecret: name.optional(),
    /** How the client authenticates at the token endpoint: in the body, or HTTP Basic. */
    clientAuth: s.enum(["post", "basic"]).default("post"),
    scopes: s.array(SignInScope).default([]),
    access: SignInAccess,
  })
  .strict();

/** A sign-in, with defaults filled in. */
export type IntegrationSignIn = Infer<typeof SignIn>;

const Token = s.object({ name, purpose: s.string().min(1) }).strict();

/**
 * A plain noun: letters, with single spaces between words. Only its first
 * letter may be a capital, for a product name such as "Drive file"; the rest
 * is lower case, so a sheet can't shout. No digits or other marks, so it
 * can't carry a secret or an argument value.
 */
const TOOL_NOUN_PATTERN = /^[A-Za-z][a-z]*(?: [a-z]+)*$/;

const nounWord = s
  .string()
  .regex(
    TOOL_NOUN_PATTERN,
    "use a lower-case noun of letters and spaces, such as 'email', with at most a capital first letter, such as 'Drive file'",
  );

/**
 * What one call of a tool sends, in the singular and the plural, so a run can
 * say "Sent 1 email" or "Sent 3 emails".
 */
const ToolNoun = s.object({ one: nounWord, many: nounWord }).strict();

/**
 * What one call of a tool does to its noun, in the past tense, so a run can
 * say "Saved 1 Drive file" rather than "Sent". A closed list, so a sheet
 * can't word a send as something milder: each verb still says that something
 * was made or changed; `drafted` is only for a `write` tool (`drafted-on-send-tool`).
 * The same list as `ToolVerb` in `@halonicjs/events`.
 */
const TOOL_VERBS = ["sent", "saved", "created", "updated", "moved", "drafted"] as const;

/** A tool as a sheet declares it; a plugin's local tools declare theirs the same way. */
export const IntegrationTool = s
  .object({
    name: s.string().min(1),
    /** Word for word the code's text: it is what the user approves and the model reads. */
    description: s.string().min(1),
    /** Each argument's description, word for word as in the code. */
    arguments: s.record(s.string().min(1), s.string().min(1)).optional(),
    /** `read` changes nothing, `write` changes data, `send` reaches people outside. */
    risk: s.enum(["read", "write", "send"]),
    /** What a `send` tool sends, such as `{ one: email, many: emails }`. */
    noun: ToolNoun.optional(),
    /** What one call does to its noun, such as `saved`; absent means `sent`. Only next to a noun. */
    verb: s.enum(TOOL_VERBS).optional(),
    /** Whether the result carries outside content, such as mail. Always stated. */
    untrusted: s.boolean(),
  })
  .strict();

/** A sheet's tool. */
export type IntegrationTool = Infer<typeof IntegrationTool>;

/** The secret of Halonic's own Google sign-in; only a sheet with it may have the Google fields. */
export const GOOGLE_SECRET = "google-account";

/**
 * A Google scope: `https://www.googleapis.com/auth/<name>`, or one of the
 * sign-in scopes Google names without a URL.
 */
export const GOOGLE_SCOPE_PATTERN =
  /^(?:https:\/\/www\.googleapis\.com\/auth\/[a-z][a-z0-9._-]*|openid|email|profile)$/;

/** A Google API's service name, as the Cloud Console uses it, such as `gmail.googleapis.com`. */
export const GOOGLE_API_PATTERN = /^[a-z][a-z0-9-]*\.googleapis\.com$/;

/**
 * Google's name for an API, such as `Gmail API` or `Cloud Pub/Sub API`: up to
 * 80 letters, digits, spaces and `( ) & ' / . , -`, starting with a letter or
 * digit. No `:`, so no link with a scheme fits. The Google setup record keeps
 * this name with the same rule, so a check result for a name this takes is
 * never refused when it is saved.
 */
export const GOOGLE_API_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ()&'/.,-]{0,79}$/;

/**
 * An `https` URL to a lower-case host without a port, user name, password
 * or `#fragment`. The host is the first group, so the sheet's checks can
 * hold it against `hosts`. The core has no `URL` class (plan 4.1).
 */
export const GOOGLE_CHECK_URL_PATTERN =
  /^https:\/\/((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?)(?:[/?][^\s#]*)?$/;

/** One scope the `google-account` token gets, and why, in words the user reads. */
const GoogleScope = s
  .object({
    scope: s
      .string()
      .regex(
        GOOGLE_SCOPE_PATTERN,
        "use a full Google scope URL, such as 'https://www.googleapis.com/auth/drive', or openid, email or profile",
      ),
    /** Shown to the user as it is. */
    reason: s.string().regex(/\S/, "say why the integration needs the scope"),
    /**
     * Only `true`, for a scope Google calls restricted: a scope that isn't
     * leaves the key out, so a `false` can't hide a typo.
     */
    restricted: s.literal(true).optional(),
  })
  .strict();

/** One API the user switches on in the Google Cloud Console. */
const GoogleApi = s
  .object({
    api: s
      .string()
      .regex(GOOGLE_API_PATTERN, "use the API's service name, such as 'drive.googleapis.com'"),
    /** Google's name for the API, shown to the user as it is. */
    name: s
      .string()
      .regex(
        GOOGLE_API_NAME_PATTERN,
        "use Google's name for the API, such as 'Google Drive API', with no ':' and at most 80 characters",
      ),
  })
  .strict();

/**
 * The one read the host sends after sign-in to see that the API is on. It
 * only looks, so it is a `GET` without a body.
 */
const GoogleCheck = s
  .object({
    method: s.literal("GET"),
    url: s
      .string()
      .regex(
        GOOGLE_CHECK_URL_PATTERN,
        "use an https URL without a port, user name, password or #fragment, such as 'https://gmail.googleapis.com/gmail/v1/users/me/profile'",
      ),
  })
  .strict();

/** One hour, the most a timeout may be. */
export const MAX_TIMEOUT_MS = 3_600_000;
/** One GiB, the largest response a sheet may allow. */
export const MAX_RESPONSE_BYTES = 1_073_741_824;

const timeout = s.number().int().positive().max(MAX_TIMEOUT_MS);

/** The kit's request limits; each has an upper bound, so a sheet can't switch one off. */
const Limits = s
  .object({
    /** The whole request, reading the body included. */
    timeoutMs: timeout.optional(),
    /** Waiting for the response headers, redirects included. */
    headersTimeoutMs: timeout.optional(),
    /** Waiting for the next piece of the body. */
    idleTimeoutMs: timeout.optional(),
    maxResponseBytes: s.number().int().positive().max(MAX_RESPONSE_BYTES).optional(),
  })
  .strict();

/**
 * A field that holds the user's own content, as the recorder reads it:
 * `request.body` or `response.body`, then `.name`, `.*`, `[*]` or `[n]`
 * steps; or `request.query.<name>`, one query parameter.
 */
export const CONTENT_PATH_PATTERN =
  /^(?:(?:request|response)\.body(?:\.[^.[\]*\s]+|\.\*|\[(?:\*|\d+)\])*|request\.query\.[^.[\]*\s]+)$/;

/** What the recorder must scrub beyond the rules every integration gets. */
const Recording = s
  .object({
    userContent: s
      .array(
        s
          .string()
          .regex(
            CONTENT_PATH_PATTERN,
            "use a path from request.body, response.body or request.query, such as 'response.body.items[*].text'",
          ),
      )
      .optional(),
    /** Query parameters, form fields and JSON field names that carry a secret. */
    secretFields: s.array(s.string().min(1)).optional(),
    /** Content types, such as `text/plain`, that may be saved as plain text. */
    allowContentTypes: s
      .array(
        s
          .string()
          .regex(
            /^[a-z0-9][\w!#$&^.+-]*\/[a-z0-9][\w!#$&^.+-]*$/i,
            "use type/subtype, such as 'text/plain'",
          ),
      )
      .default([]),
  })
  .strict();

/**
 * `integration.yaml`: what an integration may do, which the user approves
 * before it runs. The kit enforces its hosts and secrets.
 */
export const IntegrationSheet = s
  .object({
    /** The integration's name. */
    id: name,
    version: s.string().regex(/^\d+\.\d+\.\d+$/, "use major.minor.patch, such as '1.0.0'"),
    /** The `Integration` port version it was built against. */
    kit: s.number().int().positive(),
    provides: s.array(s.enum(["connector", "llm", "knowledge"])).min(1),
    hosts: s.array(Host),
    /**
     * Secret name → why, where it may go and how the kit puts it in; or, for
     * a sign-in's client secret, only why.
     */
    secrets: s.record(name, Secret).default({}),
    /** Sign-in name → how Halonic signs in, and where the access token may go. Needs `kit: 2`. */
    signIns: s.record(name, SignIn).default({}),
    // Studio builds the Google setup steps from the three Google fields
    // (`@halonicjs/google-setup`). Only a sheet with the `google-account`
    // secret may have them.
    /** Each scope the `google-account` token gets, and why. */
    googleScopes: s.array(GoogleScope).optional(),
    /** The APIs to switch on; at least one whenever `googleScopes` is set. */
    googleApis: s.array(GoogleApi).optional(),
    googleCheck: GoogleCheck.optional(),
    /** Values the integration itself writes and reads back later. */
    tokens: s.array(Token).default([]),
    tools: s.array(IntegrationTool).default([]),
    /** Capabilities beyond HTTP. `process` starts a local program. */
    needs: s.array(s.enum(["process"])).default([]),
    limits: Limits.optional(),
    recording: Recording.optional(),
  })
  .strict();

/** A permission sheet, with defaults filled in. */
export type IntegrationSheet = Infer<typeof IntegrationSheet>;
