import { type Infer, s } from "@halonicjs/schema-kit";

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

/** The limits `meter: config` holds every user to, written in the file itself. */
export const ConfigMeterSettings = s
  .object({
    limits: s.array(UsageLimit).default([]),
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
  })
  .strict();

/** One usage limit, with defaults filled in. */
export type UsageLimit = Infer<typeof UsageLimit>;
/** The settings of `meter: config`. */
export type ConfigMeterSettings = Infer<typeof ConfigMeterSettings>;
/** The settings of `meter: cloud`. */
export type CloudMeterSettings = Infer<typeof CloudMeterSettings>;
/** A deployment's `users` block, with defaults filled in. */
export type DeploymentUsers = Infer<typeof DeploymentUsers>;
