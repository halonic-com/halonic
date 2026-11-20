import type { CreatedTrust } from "../new-workspace/new-workspace-dialog.tsx";

/** What the app did when asked for the Acme sample (flow-first-run 2.2). */
export type CreatedSample =
  /** A copy was written in a new folder; `name` is the folder's own, such as "Acme sample 2". */
  | {
      readonly kind: "created";
      readonly folder: string;
      readonly name: string;
      readonly trust: CreatedTrust;
    }
  /** A sample the device already knows is in this folder, so nothing was written. */
  | { readonly kind: "existing"; readonly folder: string }
  /** Nothing was written: `folder` is where it was meant to go, as the person knows it. */
  | {
      readonly kind: "cant";
      readonly folder: string;
      readonly reason: string;
      /** True when the shell gave no answer; Welcome then words it itself, never with `reason`. */
      readonly unavailable?: true;
    };

/** What the app does for **Open demo** on Welcome. */
export interface SampleHost {
  /**
   * Copies the Acme sample into a new folder in Documents and saves its trust record. It never
   * writes into a folder that is there. `known` lists the folders this device remembers as the
   * sample: when the first sample folder name that is taken is one of them, that folder is
   * `existing` and nothing is written. A **Fresh copy** passes none. Rejects only for a bug; a
   * refusal is `cant`.
   */
  create(known: readonly string[]): Promise<CreatedSample>;
}
