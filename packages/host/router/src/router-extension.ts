import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * The router-only fields of the provider catalog, kept out of the public
 * `models.yaml` format (architecture note section 9, HAL-16984). They sit in
 * `providers.router.yaml`, one entry per alias in `providers.yaml`.
 */

/**
 * Which data rules apply to an alias (HAL-16987): `anthropic` is Anthropic's
 * own API, `open-pinned` an open model on one pinned host. The hard rules
 * decide which classes may get which tasks.
 */
export const dataClasses = ["anthropic", "open-pinned"] as const;

/**
 * Whether the router may pick an alias: `approved` for live routing, `trial`
 * only in the stage trials, `retired` never (kept so old decisions resolve).
 * Listed from most to least trusted.
 */
export const aliasStatuses = ["approved", "trial", "retired"] as const;

/** An OpenRouter host with its precision, such as `deepinfra/fp8`. */
const hostName = s
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/, "use a host such as deepinfra/fp8");

/** The router's fields for one alias. */
export const RouterAliasFields = s
  .object({
    dataClass: s.enum(dataClasses),
    status: s.enum(aliasStatuses),
    /** The one OpenRouter host an `open-pinned` alias may use. */
    pinnedHost: hostName.optional(),
  })
  .strict();

/** `providers.router.yaml`: the router's fields, by alias name. */
export const RouterExtension = s
  .object({
    aliases: s.record(s.string(), RouterAliasFields),
  })
  .strict();

/** An alias's data class. */
export type DataClass = (typeof dataClasses)[number];
/** An alias's routing status. */
export type AliasStatus = (typeof aliasStatuses)[number];
/** The router's fields for one alias. */
export type RouterAliasFields = Infer<typeof RouterAliasFields>;
/** The content of `providers.router.yaml`. */
export type RouterExtension = Infer<typeof RouterExtension>;
