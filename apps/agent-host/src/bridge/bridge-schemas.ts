import type { BridgeProvider, BridgeProviderAccess, ModelPrice } from "@halonicjs/ports";
import { type Schema, s } from "@halonicjs/schema-kit";
import type { ChannelAnswer } from "../server/call-channel.ts";
import { portSchema } from "../server/port-schema.ts";

const access: Schema<BridgeProviderAccess> = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("key"), secret: s.string().min(1) }).strict(),
  s.object({ kind: s.literal("sign-in") }).strict(),
]);

const tokenPrice = s.number().min(0);
const price = portSchema<ModelPrice>(
  s
    .object({
      input: tokenPrice,
      output: tokenPrice,
      cacheRead: tokenPrice.optional(),
      cacheWrite: tokenPrice.optional(),
      cacheWrite1h: tokenPrice.optional(),
    })
    .strict(),
);

/** Each provider's models with a price in `models.yaml`; a model left out is unpriced. */
export type PriceTable = Partial<Record<BridgeProvider, Record<string, ModelPrice>>>;

/** What Studio gives to open a bridge for one run. */
export interface OpenBridgeBody {
  runId: string;
  agentId: string;
  providers: Partial<Record<BridgeProvider, BridgeProviderAccess>>;
  /**
   * The port asks for a model's price while a call is recorded, without
   * waiting, so the prices come along when the bridge opens instead of
   * over the channel.
   */
  prices: PriceTable;
}

export const openBridgeBody = portSchema<OpenBridgeBody>(
  s
    .object({
      runId: s.string().min(1),
      agentId: s.string().min(1),
      providers: s.object({ anthropic: access.optional(), openai: access.optional() }).strict(),
      prices: s
        .object({
          anthropic: s.record(s.string(), price).optional(),
          openai: s.record(s.string(), price).optional(),
        })
        .strict(),
    })
    .strict(),
);

export const bridgeBody = s.object({ bridge: s.string().min(1) }).strict();

export const answerBody: Schema<{ bridge: string; call: string } & ChannelAnswer> = s.union([
  s.object({ bridge: s.string().min(1), call: s.string().min(1), result: s.unknown() }).strict(),
  s.object({ bridge: s.string().min(1), call: s.string().min(1), error: s.string() }).strict(),
]);

/** The price of `model` from the table, or `null`; never a key the table inherits. */
export function priceIn(
  table: PriceTable,
  provider: BridgeProvider,
  model: string,
): ModelPrice | null {
  const prices = table[provider];
  return prices !== undefined && Object.hasOwn(prices, model) ? (prices[model] ?? null) : null;
}
