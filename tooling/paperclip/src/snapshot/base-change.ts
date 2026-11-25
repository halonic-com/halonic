/**
 * What the snapshot reads from an open pull request's newest base change.
 * Split from `read.ts` to keep it under the size limit (HAL-17929).
 */

/** The parts of an open pull request's GraphQL node these read. */
export interface BaseChangeNode {
  readonly baseRefName: string;
  /** The newest base change, by hand or by GitHub when the base branch was deleted. Absent in recordings made before the field. */
  readonly baseChanges?: {
    readonly nodes: readonly {
      readonly createdAt?: string;
      /** A `BaseRefChangedEvent`'s base before it. Absent in recordings made before the field. */
      readonly previousRefName?: string;
      /** The same for an `AutomaticBaseChangeSucceededEvent`. */
      readonly oldBase?: string;
    }[];
  };
  /** The newest reopen or force push. Absent in recordings made before the field. */
  readonly reopens?: { readonly nodes: readonly { readonly createdAt?: string }[] };
  readonly commits: {
    readonly nodes: readonly { readonly commit: { readonly committedDate?: string } }[];
  };
}

/**
 * Its base became the default branch, or changed on it, after it was last
 * reopened or pushed to. GitHub runs a ruleset's required workflow only on
 * opened, synchronize and reopened, never on a base change, so such a pull
 * request stays blocked with its checks green until it is reopened or pushed
 * to (HAL-16394). It compares with the reopen or push, not with the note
 * check: the repository's own copy of that workflow also runs on `edited`,
 * under the same name, and that run doesn't clear the block. A push is read
 * from the head commit's date, so pushing an older commit wakes the author
 * once too often, never once too few.
 */
export function baseChangedSincePush(node: BaseChangeNode, defaultBranch: string): boolean {
  const changedAt = node.baseChanges?.nodes.at(-1)?.createdAt;
  if (changedAt === undefined || node.baseRefName !== defaultBranch) {
    return false;
  }
  const touches = [
    node.reopens?.nodes.at(-1)?.createdAt,
    node.commits.nodes[0]?.commit.committedDate,
  ].flatMap((at) => (at === undefined ? [] : [Date.parse(at)]));
  return touches.every((at) => at < Date.parse(changedAt));
}

/**
 * The base before its newest base change, such as the branch of the pull
 * request below a stacked one (HAL-17929), when the query read it.
 */
export function previousBaseOf(node: BaseChangeNode): { previousBase?: string } {
  const change = node.baseChanges?.nodes.at(-1);
  const previous = change?.previousRefName ?? change?.oldBase;
  return previous === undefined ? {} : { previousBase: previous };
}
