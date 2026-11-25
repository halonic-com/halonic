import type { ServerPorts } from "./api.ts";
import type { CloudSignInPorts } from "./cloud-sign-in-api.ts";
import type { Principal } from "./principal.ts";
import type { SessionVerifier } from "./session-verifier.ts";

/** Who may see a run: only whoever started it, or every member of the organisation. */
export type RunVisibility = "private" | "organisation";

/** Who started a run and who may see it, recorded when the run is first claimed. */
export interface RunOwnership {
  /** The actor who started the run; empty when nobody is named. */
  readonly startedBy: string;
  readonly visibility: RunVisibility;
}

/**
 * The owners of one scope's runs. A run's owner is written once, when its id is first claimed,
 * before the run starts; nothing changes who started it afterwards.
 */
export interface RunOwnershipStore {
  /**
   * Records `owner` for the run id unless the scope already has an owner for it, in one step, so
   * two starts with one id can't both win.
   *
   * @returns the owner now stored: `owner` when this call recorded it, the earlier one otherwise
   */
  claim(runId: string, owner: RunOwnership): Promise<RunOwnership>;
  /** The run's owner, or `null` when the scope has no record for it. */
  get(runId: string): Promise<RunOwnership | null>;
}

/**
 * The run ports of one scope: the runs and run list a principal's scope owns, and who started
 * each run. Two principals with different scopes get ports that share no stored data.
 */
export type ScopedRunPorts = Pick<ServerPorts, "runs" | "runStore"> & {
  /**
   * Who started each run. Without it nothing is recorded: a personal scope's runs are its user's,
   * and an organisation's runs belong to nobody, so no member may read, answer or start one.
   */
  readonly ownership?: RunOwnershipStore;
  /** Who may see a run the principal starts; `private` when the scope sets nothing. */
  readonly defaultRunVisibility?: RunVisibility;
};

/** What the account menu shows of a scope's use of its plan (S2-25). */
export interface AccountUsage {
  /** The plan's name, such as "Pro", or `null` with no plan. */
  readonly plan: string | null;
  /**
   * What was spent of the cost limit this period, as a whole percent rounded down and at most
   * 100, or `null` with no cost limit.
   */
  readonly usedPercent: number | null;
}

/**
 * What a server needs to let many people sign in, each for their own scope (`users.mode: many`).
 * A server built with these has no shared password: every route but `GET /api/hello` and the
 * Studio page needs a session, and the only run ports a route reaches are the principal's own.
 */
export interface ManyUserPorts {
  /**
   * Checks the session token a request carries. It must check a signature against a key it
   * trusts, never trust a header; a verifier made for tests is refused when the server starts.
   */
  readonly verifier: SessionVerifier;
  /** The session cookie's name. The same token may come as `Authorization: Bearer` instead. */
  readonly cookieName: string;
  /**
   * The run ports for the principal's scope, built for each request. This is the only way a
   * route of a many-user server gets run ports.
   */
  scopedRuns(principal: Principal): ScopedRunPorts;
  /**
   * Sign-in through Halonic Cloud: `GET /api/sign-in` and its return route. Without it those
   * routes answer 404, and sessions come from elsewhere.
   */
  readonly cloudSignIn?: CloudSignInPorts;
  /**
   * The principal's plan and how much of its cost limit they used, for `GET /api/account-menu`.
   * Without it the menu shows no plan and no percent. It throws when it can't answer, so the
   * menu fails instead of showing a wrong plan.
   */
  accountUsage?(principal: Principal): Promise<AccountUsage>;
}
