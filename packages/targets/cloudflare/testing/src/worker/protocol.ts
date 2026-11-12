/**
 * What the test Worker and the Node runner say to each other. The Worker
 * lists the cases it has collected, then runs one case per request, so each
 * case shows up in Vitest as its own test.
 */

/** Data a `describe` carries, such as `{ requirement: "contracts.clock" }` from `verifies()`. */
export type SuiteMeta = Record<string, string | number | boolean>;

/** A `describe` block, with the blocks and cases inside it in the order they were written. */
export interface SuiteNode {
  readonly kind: "suite";
  readonly name: string;
  readonly meta: SuiteMeta;
  readonly children: readonly CaseTree[];
}

/** One `it` or `test`. `id` is what the runner sends back to run it. */
export interface CaseNode {
  readonly kind: "case";
  readonly id: string;
  readonly name: string;
}

/** A node of the case tree the Worker lists. */
export type CaseTree = SuiteNode | CaseNode;

/** How one case ended inside workerd. */
export interface CaseResult {
  readonly status: "passed" | "failed";
  /** How many `expect` calls the case made, for the requirement guard. */
  readonly assertions: number;
  /** The error message when the case failed. */
  readonly message?: string;
  /** The error's stack when the case failed, as workerd printed it. */
  readonly stack?: string;
}

/** The Worker's paths. */
export const workerPaths = {
  /** `GET`: the case tree, as a {@link SuiteNode} for the top level. */
  cases: "/cases",
  /** `POST` with `{ "id": … }`: runs one case and answers a {@link CaseResult}. */
  run: "/run",
} as const;
