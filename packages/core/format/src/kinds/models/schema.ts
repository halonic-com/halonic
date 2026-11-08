import { type Infer, s } from "@halonicjs/schema-kit";
import { id, ModelParams, version } from "../../shared/fields.ts";

/** Price per million tokens, in the workspace's budget currency. */
export const ModelPrice = s
  .object({
    input: s.number().min(0),
    output: s.number().min(0),
  })
  .strict();

/** A model at a provider, with its tuning and price. */
export const ModelTarget = s
  .object({
    provider: id,
    model: s.string().min(1),
    params: ModelParams.default({}),
    /** What the model costs, so runs know their cost and budgets can stop them. */
    price: ModelPrice.optional(),
  })
  .strict();

/** An alias ("fast", "smart", "local"): a target plus the aliases to try when it fails. */
export const ModelAlias = ModelTarget.extend({
  description: s.string().optional(),
  /** Other alias names tried in order when this one fails. */
  fallback: s.array(s.string()).default([]),
}).strict();

/** `models.yaml`: the workspace's model aliases. */
export const Models = s
  .object({
    version,
    aliases: s.record(s.string(), ModelAlias),
  })
  .strict();

/** A model alias, with defaults filled in. */
export type ModelAlias = Infer<typeof ModelAlias>;
/** The content of `models.yaml`, with defaults filled in. */
export type Models = Infer<typeof Models>;
