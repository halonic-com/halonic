import { type Infer, s } from "@halonicjs/schema-kit";
import { ExposedWorkflow } from "./exposed.ts";

/** The most characters a Halonic Cloud product id may have. */
const PRODUCT_ID_MAX_LENGTH = 64;

/**
 * One usage limit, the same shape as a plan's Limit in Halonic Cloud
 * (selling layer design, section 2), so a deployment can move from
 * `meter: config` to `meter: cloud` without rewriting its limits.
 */
export const UsageLimit = s
  .object({
    /**
     * What is counted: `runs`, `steps`, `tokens` (input plus output),
     * `cost` (model cost at the provider's list price) or `harnessMinutes`.
     */
    unit: s.enum(["runs", "steps", "tokens", "cost", "harnessMinutes"]),
    /** The most of `unit` one user may use in one `period`. */
    amount: s.number().positive(),
    /** What one `amount` covers: a UTC day or month, one run, or one step. */
    period: s.enum(["day", "month", "run", "step"]),
    /** At the limit, `stop` the run or only `notify`. */
    action: s.enum(["stop", "notify"]).default("stop"),
  })
  .strict();

/** The most runs one organisation or member may have going at once. */
const Concurrency = s.number().int().positive();

/**
 * One person in an organisation, by their Halonic Cloud account id. Their
 * own `limits` are a share of the organisation's pool, not extra on top.
 */
export const OrganisationMember = s
  .object({
    /** The member's account id in Halonic Cloud (`eu_…`). */
    actor: s.string().regex(/^eu_[A-Za-z0-9]{16,40}$/, "use 'eu_' and 16 to 40 letters or digits"),
    /** An `owner` manages the organisation and its members, an `admin` its members only. */
    role: s.enum(["owner", "admin", "member"]),
    /** The member's share of the organisation's pool limits. */
    limits: s.array(UsageLimit).optional(),
    /** The most runs this member may have going at once. */
    concurrency: Concurrency.optional(),
  })
  .strict();

/**
 * A group of users who share one pool of limits (selling layer design,
 * section 2), in the same shape as an organisation in Halonic Cloud.
 */
export const Organisation = s
  .object({
    /** The organisation's id in Halonic Cloud (`org_…`). */
    id: s.string().regex(/^org_[A-Za-z0-9]{16,40}$/, "use 'org_' and 16 to 40 letters or digits"),
    /** The limits all members together are held to. */
    limits: s.array(UsageLimit).default([]),
    /** The most runs all members together may have going at once. */
    concurrency: Concurrency.optional(),
    /** The people in the organisation; at least one is an `owner`. */
    members: s.array(OrganisationMember),
  })
  .strict();

/** The limits `meter: config` holds every user to, written in the file itself. */
export const ConfigMeterSettings = s
  .object({
    limits: s.array(UsageLimit).default([]),
    /** Groups of users who share a pool of limits. */
    organisations: s.array(Organisation).optional(),
  })
  .strict();

/** Where `meter: cloud` reports usage. The product id is not a secret. */
export const CloudMeterSettings = s
  .object({
    /** The product's id in Halonic Cloud. */
    product: s
      .string()
      .min(1)
      .max(PRODUCT_ID_MAX_LENGTH, `use at most ${PRODUCT_ID_MAX_LENGTH} characters`)
      .regex(/^[A-Za-z0-9_-]+$/, "use letters, digits, '_' or '-'"),
  })
  .strict();

/**
 * Who may use a deployment and how their usage is counted (selling layer
 * design, section 1). Without the block a deployment behaves as before: one
 * owner, nothing metered.
 */
export const DeploymentUsers = s
  .object({
    /** `owner`: only the deployment's owner, as before. `many`: each person signs in for their own space. */
    mode: s.enum(["owner", "many"]).default("owner"),
    /** How usage is counted: `none`, from the `config` limits, or by Halonic Cloud. */
    meter: s.enum(["none", "config", "cloud"]).default("none"),
    /** Settings used when `meter` is `config`. */
    config: ConfigMeterSettings.optional(),
    /** Settings used when `meter` is `cloud`. */
    cloud: CloudMeterSettings.optional(),
    /**
     * The workflows end users may start, with `mode: many` only. Without the
     * list, or with an empty one, nothing is exposed.
     */
    exposed: s.array(ExposedWorkflow).optional(),
  })
  .strict();

/** One usage limit, with defaults filled in. */
export type UsageLimit = Infer<typeof UsageLimit>;
/** One member of an organisation, with defaults filled in. */
export type OrganisationMember = Infer<typeof OrganisationMember>;
/** One organisation, with defaults filled in. */
export type Organisation = Infer<typeof Organisation>;
/** The settings of `meter: config`. */
export type ConfigMeterSettings = Infer<typeof ConfigMeterSettings>;
/** The settings of `meter: cloud`. */
export type CloudMeterSettings = Infer<typeof CloudMeterSettings>;
/** A deployment's `users` block, with defaults filled in. */
export type DeploymentUsers = Infer<typeof DeploymentUsers>;
