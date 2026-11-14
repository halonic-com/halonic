/**
 * The workspace a served Studio shows, as `GET /api/workspace` answers it. `folder` is already
 * shortened for people (`~/Projects/acme`) and is never an absolute path.
 */
export interface ServedWorkspace {
  readonly name: string;
  /** Whether it is the sample workspace; the picker marks it with the Sample tag. */
  readonly sample: boolean;
  readonly folder: string;
}

/** Asks the computer running Halonic which workspace it serves. Rejects when it can't answer. */
export type LoadServedWorkspace = () => Promise<ServedWorkspace>;
