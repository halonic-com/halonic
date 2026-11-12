/**
 * Names and cleanup of the resources live suites create (ADR 5.9). Every one
 * is named `hlt-<run>-<attempt>-<what>`, so the sweeper can find what a dead
 * run left behind and never touches anything else.
 */

/** The prefix of every live test resource. */
export const liveResourcePrefix = "hlt-";

/** How old a live test resource may get before the sweeper deletes it. */
export const liveResourceMaxAgeMs = 2 * 60 * 60 * 1000;

const namePattern = /^hlt-([0-9]+)-([0-9]+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Cloudflare's limit for Worker, D1 and R2 names. */
const maxNameLength = 63;

/** The parts of a live test resource's name. */
export interface LiveResourceName {
  readonly run: string;
  readonly attempt: string;
  readonly what: string;
}

/**
 * The name for a resource of one run attempt, such as `hlt-123-1-worker`.
 *
 * @throws when the parts don't make a valid name
 */
export function liveResourceName(run: string, attempt: string, what: string): string {
  const name = `${liveResourcePrefix}${run}-${attempt}-${what}`;
  if (parseLiveResourceName(name) === undefined) {
    throw new Error(
      `"${name}" is not a live test resource name: use digits for the run and attempt, lowercase letters, digits and dashes for the rest, and at most ${maxNameLength} characters.`,
    );
  }
  return name;
}

/** The parts of a live test resource's name, or `undefined` for any other name. */
export function parseLiveResourceName(name: string): LiveResourceName | undefined {
  const match = name.length <= maxNameLength ? namePattern.exec(name) : null;
  if (match === null) {
    return undefined;
  }
  const [, run = "", attempt = "", what = ""] = match;
  return { run, attempt, what };
}

/** A resource on a provider account, as a target's sweeper lists it. */
export interface LiveResource {
  readonly kind: string;
  readonly name: string;
  readonly createdAt: Date;
}

/** What one target needs to give the sweeper. Its `destroy` is the target's own (3b). */
export interface LiveSweeper {
  readonly target: string;
  list(): Promise<readonly LiveResource[]>;
  destroy(resource: LiveResource): Promise<void>;
}

/** What a sweep deleted, and what it couldn't. */
export interface SweepReport {
  readonly deleted: readonly LiveResource[];
  readonly failed: readonly { readonly resource: LiveResource; readonly error: string }[];
}

/** True when the sweeper may delete this resource: a live test name, older than the limit. */
export function isStale(resource: LiveResource, now: Date, maxAgeMs = liveResourceMaxAgeMs) {
  return (
    parseLiveResourceName(resource.name) !== undefined &&
    now.getTime() - resource.createdAt.getTime() > maxAgeMs
  );
}

/**
 * Deletes every stale live test resource each sweeper lists, through the
 * target's own `destroy`. A failed delete is reported, and the sweep goes on.
 */
export async function sweep(
  sweepers: readonly LiveSweeper[],
  now: Date,
  maxAgeMs = liveResourceMaxAgeMs,
): Promise<SweepReport> {
  const deleted: LiveResource[] = [];
  const failed: { resource: LiveResource; error: string }[] = [];
  for (const sweeper of sweepers) {
    for (const resource of await sweeper.list()) {
      if (!isStale(resource, now, maxAgeMs)) {
        continue;
      }
      try {
        await sweeper.destroy(resource);
        deleted.push(resource);
      } catch (error) {
        failed.push({ resource, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { deleted, failed };
}
