/**
 * Who covers a role or owns an area (HAL-17982, plan HAL-17450 rev 5,
 * "Step 2"). The rules that pick a role stay in code (`reviewerRoleFor` in
 * `reviewer-paths.ts`, the area table's paths); the workspace snapshot's
 * routing only says which agent covers it. Without a routing, today's people
 * cover each role. A routing that the snapshot loader refuses, an unknown
 * role and a role or area the routing leaves out all go to the code
 * reviewer: routing never fails open to "no review".
 */
// Only types come from the format package: the merge control's pure graph
// (`decide`) loads this file through `reviewer-paths.ts`, and may load only
// relative modules. `routingOf`, which runs the loader, is in `routing-load.ts`.
import type { Routing, RoutingRole } from "@halonicjs/format";

/** A routing the snapshot loader accepted, for callers that don't depend on the format package. */
export type { Routing };

/** The roles a routing fills: `ROUTING_ROLES` in the format package, which a test keeps equal. */
export const routingRoles: readonly RoutingRole[] = [
  "code-reviewer",
  "second-reviewer",
  "routine-reviewer",
  "clarifier",
  "merge-captain",
];

/** An agent's url key: `AGENT_NAME_PATTERN` in the format package, which a test keeps equal. */
export const agentNamePattern = /^[a-z][a-z0-9-]{0,39}$/;

/** Today's people for each role (HAL-14809), while the snapshot has no routing. */
export const defaultRoles: Readonly<Record<RoutingRole, string>> = {
  "code-reviewer": "liam",
  "second-reviewer": "julian",
  // Nora, the review-only agent (HAL-19246, the board: no shadow trial).
  "routine-reviewer": "nora",
  // Today the clarifier is a plugin setting and the merge captain is the code reviewer.
  clarifier: "liam",
  "merge-captain": "liam",
};

/** Who covers a role the routing leaves out: the routine reviewer's work falls back to the second reviewer. */
const fallbackRoles: Readonly<Partial<Record<RoutingRole, RoutingRole>>> = {
  "routine-reviewer": "second-reviewer",
};

function isRole(role: string): role is RoutingRole {
  return (routingRoles as readonly string[]).includes(role);
}

/** An agent's url key, checked again here, so a routing that skipped the loader can't name "". */
function agentName(name: unknown): string | undefined {
  return typeof name === "string" && agentNamePattern.test(name) ? name : undefined;
}

/**
 * The agent who covers a role: from the routing when it names one, today's
 * person without a routing, the second reviewer for a routine review the
 * routing leaves out, and the code reviewer for an unknown role or another
 * one the routing leaves out.
 *
 * @param role - the role, such as `second-reviewer`
 * @param routing - a routing from `routingOf` (`routing-load.ts`), or `undefined`
 * @returns an agent's url key, such as `liam`
 */
export function personFor(role: string, routing: Routing | undefined): string {
  if (routing === undefined) {
    return isRole(role) ? defaultRoles[role] : defaultRoles["code-reviewer"];
  }
  const named = isRole(role) ? agentName(routing.roles[role]) : undefined;
  const fallback = isRole(role) ? fallbackRoles[role] : undefined;
  if (named === undefined && fallback !== undefined) {
    return personFor(fallback, routing);
  }
  return named ?? agentName(routing.roles["code-reviewer"]) ?? defaultRoles["code-reviewer"];
}

/**
 * The agent who owns an area: from the routing when it names one, the area
 * table's owner without a routing, and the code reviewer for an area the
 * routing leaves out.
 *
 * @param area - the area's slug, such as `engine-and-cli`
 * @param tableOwner - the owner `docs/guides/area-owners.md` names, the fallback until routing is live
 * @param routing - a routing from `routingOf` (`routing-load.ts`), or `undefined`
 */
export function areaOwnerFor(
  area: string,
  tableOwner: string,
  routing: Routing | undefined,
): string {
  if (routing === undefined) {
    return tableOwner;
  }
  const owner = Object.hasOwn(routing.areas, area) ? agentName(routing.areas[area]) : undefined;
  return owner ?? personFor("code-reviewer", routing);
}
