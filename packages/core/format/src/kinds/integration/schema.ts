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

/** A fixed host, or the host of the URL in one of the integration's settings. */
const Host = s.union([
  s
    .string()
    .regex(
      HOST_PATTERN,
      "use an exact lower-case host name with an optional :port, such as 'api.example.com'",
    ),
  s.object({ fromSetting: s.string().min(1) }).strict(),
]);

/** A host as the sheet writes it. */
export type IntegrationHost = Infer<typeof Host>;

/**
 * What every secret says, wherever the kit puts it. A plugin's local tool
 * declares its secrets with these fields, without `as`.
 */
export const secretFields = {
  /** Why the integration needs it, in words the user understands. */
  purpose: s.string().min(1),
  /** The hosts it may go to. Each must be in the sheet's `hosts`. */
  hosts: s.array(Host).min(1),
  /** Sent only when the workspace has set it up; without it the request goes out bare. */
  optional: s.boolean().default(false),
};

/** An HTTP header name. */
const headerName = s.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/, "use an HTTP header name");

/** One secret and where the kit puts it, as `SecretPlacement` in the ports says. */
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
]);

/** A secret, with `optional` filled in. */
export type IntegrationSecret = Infer<typeof Secret>;

const Token = s.object({ name, purpose: s.string().min(1) }).strict();

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
    /** Secret name → why, where it may go and how the kit puts it in. */
    secrets: s.record(name, Secret).default({}),
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
