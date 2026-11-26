/** What the agents host tells about an agent's model: its missing key and its alias's line. */

/** An agent's model that needs an API key that isn't stored here (states H19). */
export interface MissingModelKey {
  /** The model as the agent's file names it, such as `smart`. */
  readonly model: string;
  /** The provider's name, such as Anthropic. */
  readonly provider: string;
  /** The name the provider's key is stored under, never the key, for its key block on Models. */
  readonly secretName: string;
}

/**
 * What a model alias costs, for the line under the Model page's picker (UX 2.5, microcopy 8.5):
 * its price per million tokens, as amounts in the workspace's currency such as "€3.00", or why
 * there is none to show.
 *
 * - `no-price`: the alias has no price yet, so the line offers **Add a price**.
 * - `on-this-computer`: its provider runs on this computer and the alias has no price.
 * - `test-model`: the built-in test model, which never costs anything.
 */
export type AliasCost =
  | { readonly kind: "price"; readonly input: string; readonly output: string }
  | { readonly kind: "no-price" | "on-this-computer" | "test-model" };

/** A model alias as the line under the Model page's picker shows it. */
export interface AliasSummary {
  /** The provider's name, never its id, such as Anthropic. */
  readonly provider: string;
  /** The model's name at the provider, such as `claude-sonnet-5-5`. */
  readonly model: string;
  readonly cost: AliasCost;
}
