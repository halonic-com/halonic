/**
 * Whether a workspace's `default` model is the built-in test model, kept current as its files
 * change. The demo's **Sample answers** chip shows only while it is: once a real model is picked,
 * the answers are no longer scripted (first-run-flow 10.2 R3).
 */
export interface TestModelWatch {
  /** True while the `default` alias of `models.yaml` uses a provider of type `mock`. */
  readonly onTestModel: boolean;
  /** Calls `listener` after `onTestModel` may have changed; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}
