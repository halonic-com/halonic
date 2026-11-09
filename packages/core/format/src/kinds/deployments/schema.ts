import { type Infer, s } from "@halonicjs/schema-kit";
import { deploymentId, version } from "../../shared/fields.ts";

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

/** One deployment, with defaults filled in. */
export type Deployment = Infer<typeof Deployment>;
/** The content of `deployments.yaml`, with defaults filled in. */
export type Deployments = Infer<typeof Deployments>;
