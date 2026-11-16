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
  /** Nothing was written: `folder` is where it was meant to go, as the person knows it. */
  | { readonly kind: "cant"; readonly folder: string; readonly reason: string };

/** What the app does for **Try the Acme sample** on Welcome. */
export interface SampleHost {
  /**
   * Copies the Acme sample into a new folder in Documents and saves its trust record. It never
   * writes into a folder that is there. Rejects only for a bug; a refusal is `cant`.
   */
  create(): Promise<CreatedSample>;
}
