import type { ServerPorts } from "./api.ts";
import type { Principal } from "./principal.ts";
import type { SessionVerifier } from "./session-verifier.ts";

/**
 * The run ports of one scope: the runs and run list a principal's scope owns. Two principals
 * with different scopes get ports that share no stored data.
 */
export type ScopedRunPorts = Pick<ServerPorts, "runs" | "runStore">;

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
}
