/**
 * OpenRouter's `provider` routing field, as a model alias sets it in
 * `params.extra.provider` and the harness bridge sends it (HAL-16834): which
 * hosts may serve the call, in what order, and on what terms. Only these
 * keys exist; the models file refuses any other.
 *
 * - `order`: the hosts to try, in order, such as `deepinfra/fp8`;
 * - `only`, `ignore`: the hosts allowed, or never used;
 * - `allow_fallbacks`: `false` to never use a host outside `order`;
 * - `data_collection`: `deny` to use only hosts that don't keep or train on the data;
 * - `zdr`: `true` to use only hosts that keep no data at all;
 * - `quantizations`: the precisions allowed, such as `fp8`.
 */
export interface ProviderRouting {
  readonly order?: readonly string[];
  readonly only?: readonly string[];
  readonly ignore?: readonly string[];
  readonly allow_fallbacks?: boolean;
  readonly data_collection?: "allow" | "deny";
  readonly zdr?: boolean;
  readonly quantizations?: readonly string[];
}
