import { type Infer, s } from "@halonicjs/schema-kit";
import { deploymentId, version } from "../../shared/fields.ts";

/**
 * The most characters a Worker name may have: it becomes the first label of
 * `<worker>.<account>.workers.dev`, and a DNS label holds at most 63.
 */
const WORKER_NAME_MAX_LENGTH = 63;

/**
 * A host name: lowercase labels of letters, digits and inner `-`, joined by
 * dots, at most 253 characters, with a top-level label that isn't all digits.
 */
const HOST_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Non-secret settings for a deployment with `host: cloudflare` (ADR HAL-35,
 * 5.7). They carry no account id, token or key, so the file stays safe to
 * commit and the same file deploys from any account.
 */
export const CloudflareSettings = s
  .object({
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
  })
  .strict();

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
    limits: DeploymentLimits.optional(),
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
