import { ShellError } from "../shell-error.ts";

/** Who added a contribution; every contribution the shell hands out carries it. */
export interface Contributed {
  /** The id of the feature that added it. */
  readonly featureId: string;
}

/** Contributions that are shown in order: lower `order` first, ties by `id`. */
export interface Ordered {
  readonly id: string;
  readonly order: number;
}

/**
 * What contribution ids and kinds look like: names of letters, digits and
 * dashes, starting with a letter, joined by dots, such as `agents.new-agent`
 * or `codeEditor.undo`.
 */
const contributionIdPattern = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)*$/;

/** Whether a value is a valid contribution id, for checks that leave a bad one out rather than throw. */
export function isContributionId(value: unknown): value is string {
  return typeof value === "string" && contributionIdPattern.test(value);
}

/**
 * Checks that an id or kind field of a contribution is a valid name.
 *
 * @throws ShellError naming the point, the feature and the field
 */
export function checkContributionId(
  pointName: string,
  featureId: string,
  field: string,
  value: unknown,
): void {
  if (!isContributionId(value)) {
    throw new ShellError(
      `${pointName}: the feature "${featureId}" gives ${field} ${JSON.stringify(value)}. Use letters, digits and dashes, starting with a letter, joined by dots, such as "agents.new-agent".`,
    );
  }
}

/**
 * The contribution as the shell keeps it: a frozen copy that records the
 * feature that added it. Only plain objects (object literals) are taken,
 * because a copy of an object made from a class would lose its methods.
 *
 * @throws ShellError when the contribution isn't a plain object
 */
export function registered<Contribution>(
  pointName: string,
  featureId: string,
  contribution: Contribution,
): Contribution & Contributed {
  const prototype =
    typeof contribution === "object" && contribution !== null
      ? Object.getPrototypeOf(contribution)
      : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ShellError(
      `${pointName}: the feature "${featureId}" gives something that isn't a plain object. Pass an object literal, such as { id, ... }, not an instance of a class.`,
    );
  }
  return Object.freeze({ ...contribution, featureId });
}

/**
 * The contributions to one point, each unique by its key fields. Keeps them
 * in the order they were added.
 */
export class PointStore<Contribution> {
  private readonly entries = new Map<string, Contribution & Contributed>();
  private readonly pointName: string;
  private readonly keyFields: readonly (keyof Contribution & string)[];

  /**
   * @param pointName how messages name the point, such as `itemPage.addSection`
   * @param keyFields the fields that together make a contribution unique, such
   *   as `["on", "id"]`; each must be a valid contribution id
   */
  constructor(pointName: string, keyFields: readonly (keyof Contribution & string)[]) {
    this.pointName = pointName;
    this.keyFields = keyFields;
  }

  /**
   * Adds a contribution.
   *
   * @throws ShellError when it isn't a plain object, a key field isn't a
   *   valid id, or its key is taken
   */
  add(featureId: string, contribution: Contribution): void {
    const entry = registered(this.pointName, featureId, contribution);
    for (const field of this.keyFields) {
      checkContributionId(this.pointName, featureId, field, contribution[field]);
    }
    // Ids can't contain "/", so joining them can't make two keys collide.
    const key = this.keyFields.map((field) => String(contribution[field])).join("/");
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      throw new ShellError(
        `${this.pointName}: "${key}" is added by both "${existing.featureId}" and "${featureId}". Ids must be unique; rename one.`,
      );
    }
    this.entries.set(key, entry);
  }

  /** The contribution with this key, if any. */
  get(key: string): (Contribution & Contributed) | undefined {
    return this.entries.get(key);
  }

  /** Every contribution, in the order they were added. */
  all(): readonly (Contribution & Contributed)[] {
    return [...this.entries.values()];
  }
}

/** Adds one kind of contribution. */
export interface Point<Contribution> {
  add(contribution: Contribution): void;
}

/** Throws when the feature's `register` already returned. */
export type PointGuard = (pointName: string) => void;

/** A contribution as the shell hands it out: frozen, with the feature that added it. */
export type Registered<Contribution> = Contribution & Contributed;

/** The point a feature adds to: checks the guard, then adds under the feature's id. */
export function pointOn<Contribution>(
  name: string,
  store: PointStore<Contribution>,
  featureId: string,
  guard: PointGuard,
): Point<Contribution> {
  return {
    add: (contribution) => {
      guard(name);
      store.add(featureId, contribution);
    },
  };
}

/** Sorts by `order`, then by `id`, so the result doesn't depend on load order. */
export function byOrder<Item extends Ordered>(items: readonly Item[]): Item[] {
  return [...items].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
}
