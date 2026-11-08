import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";

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
      .record(id, Deployment)
      .refine((named) => Object.keys(named).length > 0, "Name at least one deployment"),
  })
  .strict();

/** One deployment, with defaults filled in. */
export type Deployment = Infer<typeof Deployment>;
/** The content of `deployments.yaml`, with defaults filled in. */
export type Deployments = Infer<typeof Deployments>;
