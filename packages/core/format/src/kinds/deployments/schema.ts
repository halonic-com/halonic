import { type Infer, s } from "@halonicjs/schema-kit";
import { deploymentId, version } from "../../shared/fields.ts";
import { DeploymentUsers } from "./users.ts";

/**
 * The most characters a Worker name may have: it becomes the first label of
 * `<worker>.<account>.workers.dev`, and a DNS label holds at most 63.
 */
const WORKER_NAME_MAX_LENGTH = 63;

/** The most characters a host name may have in DNS. */
const HOST_NAME_MAX_LENGTH = 253;

/**
 * A host name: lowercase labels of letters, digits and inner `-`, joined by
 * dots, with a top-level label that isn't all digits. The length cap is a
 * separate `maxLength`, not a lookahead, so the JSON Schema's pattern also
 * works in Go and Rust regex libraries, which have no lookaround.
 */
const HOST_NAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Non-secret settings for a deployment with `host: cloudflare` (ADR HAL-35,
 * 5.7). They carry no token or key, so the file stays safe to commit. The
 * account id isn't a secret: it is kept so CI and other computers deploy to
 * the same account.
 */
export const CloudflareSettings = s
  .object({
    /**
     * The Cloudflare account the deployment lives in: the 32-character id
     * Cloudflare shows. `halonic deploy` writes it after the first deploy's yes.
     */
    account: s
      .string()
      .regex(
        /^[0-9a-f]{32}$/,
        "use the 32-character account id Cloudflare shows, not the account's name",
      )
      .optional(),
    /** The Worker's name; it serves at `<worker>.<account>.workers.dev`. */
    worker: s
      .string()
      .min(1)
      .max(
        WORKER_NAME_MAX_LENGTH,
        `use at most ${WORKER_NAME_MAX_LENGTH} characters, so the name fits in a workers.dev address`,
      )
      .regex(
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
        "use lowercase letters, digits or '-', not at the start or end",
      ),
    /** A custom domain the Worker also serves at, such as `halonic.example.com`. */
    domain: s
      .string()
      .max(HOST_NAME_MAX_LENGTH, `use at most ${HOST_NAME_MAX_LENGTH} characters`)
      .regex(HOST_NAME_PATTERN, "use a lowercase host name such as halonic.example.com")
      .optional(),
    /**
     * Where the deployment keeps its data. `eu` keeps D1, R2 and Durable
     * Objects in the EU jurisdiction. Cloudflare fixes it when the data is
     * first created, so changing it later needs an export and an import.
     */
    location: s.enum(["eu"]).optional(),
  })
  .strict();

/** Ceilings the deployment's handler enforces, because Cloudflare has no hard spending cap. */
export const DeploymentLimits = s
  .object({
    /** The most requests the deployment answers per UTC day; beyond it, it refuses them. */
    dailyRequests: s.number().int().positive().optional(),
    /**
     * The most of `dailyRequests` one scope may use per UTC day, so one customer can't spend the
     * day for the others. The server uses a tenth of `dailyRequests` when it's left out.
     */
    scopeDailyRequests: s.number().int().positive().optional(),
  })
  .strict()
  .superRefine((limits, context) => {
    const problem = scopeShareProblem(limits.dailyRequests, limits.scopeDailyRequests);
    if (problem !== null) {
      context.addIssue({ code: "custom", path: ["scopeDailyRequests"], message: problem });
    }
  });

/** Why a scope's share doesn't fit the daily ceiling, or null when it does or isn't set. */
function scopeShareProblem(
  dailyRequests: number | undefined,
  scopeDailyRequests: number | undefined,
): string | null {
  if (scopeDailyRequests === undefined) {
    return null;
  }
  if (dailyRequests === undefined) {
    return "set dailyRequests too: a scope's share is a share of the daily ceiling";
  }
  return scopeDailyRequests > dailyRequests ? "use at most dailyRequests" : null;
}

/** One place the workspace runs, with its own data (runs, Inbox, records, simulations). */
export const Deployment = s
  .object({
    name: s.string().min(1),
    description: s.string().optional(),
    /** Where it runs: `halonic serve` on a machine, or Cloudflare. */
    host: s.enum(["local", "cloudflare"]).default("local"),
    stage: s.enum(["development", "production"]).default("development"),
    /** Every write a connector would make is only recorded, never done. */
    shadow: s.boolean().default(false),
    /** Settings used when `host` is `cloudflare`. */
    cloudflare: CloudflareSettings.optional(),
    /** Ceilings on what the deployment answers, such as requests per day. */
    limits: DeploymentLimits.optional(),
    /** Who may use the deployment and how their usage is counted. */
    users: DeploymentUsers.optional(),
  })
  .strict();

/** `deployments.yaml`: the places the workspace runs. */
export const Deployments = s
  .object({
    version,
    /** The deployment `halonic serve` runs when none is named. */
    default: s.string().optional(),
    deployments: s
      .record(deploymentId, Deployment, { error: deploymentIdProblem })
      .refine((named) => Object.keys(named).length > 0, "Name at least one deployment"),
  })
  .strict();

/**
 * Says why a deployment id was refused. Without it a refused key only reads
 * "Invalid key in record", which doesn't tell the person what to change.
 */
function deploymentIdProblem(issue: {
  readonly code?: string;
  readonly issues?: unknown;
}): string | undefined {
  if (issue.code !== "invalid_key" || !Array.isArray(issue.issues)) {
    return undefined;
  }
  const reasons = issue.issues.flatMap((keyIssue: unknown) => {
    const isMessage =
      typeof keyIssue === "object" &&
      keyIssue !== null &&
      "message" in keyIssue &&
      typeof keyIssue.message === "string";
    return isMessage ? [keyIssue.message] : [];
  });
  return `Not a deployment id: ${reasons.join("; ")}`;
}

/** A deployment's Cloudflare settings. */
export type CloudflareSettings = Infer<typeof CloudflareSettings>;
/** A deployment's ceilings. */
export type DeploymentLimits = Infer<typeof DeploymentLimits>;
/** One deployment, with defaults filled in. */
export type Deployment = Infer<typeof Deployment>;
/** The content of `deployments.yaml`, with defaults filled in. */
export type Deployments = Infer<typeof Deployments>;
