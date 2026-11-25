import type { RunOwnership, RunOwnershipStore } from "./many-users-api.ts";
import type { Principal } from "./principal.ts";

/**
 * What a principal may read of a run: all of it, only who started it and how it went, or
 * nothing, in which case the run answers as if it didn't exist.
 */
export type RunReadAccess = "content" | "metadata" | "not-found";

/** What a principal may do to a run: act, see it but not act, or nothing, as if it didn't exist. */
export type RunActionAccess = "allowed" | "forbidden" | "not-found";

/** An action on a run: deliver an event (an answer to an approval or a continue), or cancel it. */
export type RunAction = "send" | "cancel";

/** The owner of a run that has no ownership record: the user of a personal scope, nobody in an organisation. */
export function ownerOfUnrecordedRun(principal: Principal): RunOwnership {
  const startedBy = principal.scope.kind === "user" ? principal.scope.endUserId : "";
  return { startedBy, visibility: "private" };
}

/**
 * The store a scope without a recorded owner per run works with: it records nothing, and every
 * claim answers the owner of a run that has no record, so an organisation's member starts nothing.
 */
export function unrecordedOwnership(principal: Principal): RunOwnershipStore {
  return {
    claim: async () => ownerOfUnrecordedRun(principal),
    get: async () => null,
  };
}

/** Whether the principal may manage every run of the scope's organisation. */
function managesOrganisation(principal: Principal): boolean {
  return (
    principal.scope.kind === "org" && (principal.role === "owner" || principal.role === "admin")
  );
}

/**
 * What the principal may read of a run of its own scope. A run of another scope never reaches
 * this: the scoped ports don't hold it, so it is `null` like an id that never existed.
 *
 * @param ownership - the run's stored owner, or `null` when the scope has no such run
 */
export function readAccess(principal: Principal, ownership: RunOwnership | null): RunReadAccess {
  if (ownership === null) {
    return "not-found";
  }
  if (ownership.startedBy === principal.actor || ownership.visibility === "organisation") {
    return "content";
  }
  return managesOrganisation(principal) ? "metadata" : "not-found";
}

/**
 * What the principal may do to a run of its own scope. Only whoever started a run answers it;
 * an owner or admin of the organisation may also cancel it. Whoever can see the run but not act
 * on it is told so, since the run's existence is no secret to them.
 */
export function actionAccess(
  principal: Principal,
  ownership: RunOwnership | null,
  action: RunAction,
): RunActionAccess {
  if (readAccess(principal, ownership) === "not-found" || ownership === null) {
    return "not-found";
  }
  if (ownership.startedBy === principal.actor) {
    return "allowed";
  }
  return action === "cancel" && managesOrganisation(principal) ? "allowed" : "forbidden";
}
