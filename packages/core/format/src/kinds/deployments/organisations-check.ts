import type { KindCheckProblem } from "../../kind.ts";
import type { DeploymentUsers, Organisation, OrganisationMember, UsageLimit } from "./users.ts";

/** Where a problem sits in the file. */
type Path = KindCheckProblem["path"];

/**
 * Checks the organisations of one deployment's `users.config`: each id is
 * listed once, each organisation has an owner and lists a person once, and a
 * member's limits and concurrency fit inside the organisation's.
 */
export function checkOrganisations(id: string, users: DeploymentUsers): KindCheckProblem[] {
  const organisations = users.config?.organisations ?? [];
  const path: Path = ["deployments", id, "users", "config", "organisations"];
  return [
    ...checkRepeatedOrganisations(id, organisations, path),
    ...organisations.flatMap((organisation, index) =>
      checkOrganisation(organisation, [...path, index]),
    ),
  ];
}

/** The second organisation with an id already listed is refused. */
function checkRepeatedOrganisations(
  id: string,
  organisations: readonly Organisation[],
  path: Path,
): KindCheckProblem[] {
  const seen = new Set<string>();
  return organisations.flatMap((organisation, index) => {
    if (!seen.has(organisation.id)) {
      seen.add(organisation.id);
      return [];
    }
    return [
      {
        severity: "error" as const,
        code: "users-organisation-repeated",
        path: [...path, index, "id"],
        message: `Deployment "${id}" already has organisation "${organisation.id}"`,
      },
    ];
  });
}

/** One organisation's own checks, then each member's against it. */
function checkOrganisation(organisation: Organisation, path: Path): KindCheckProblem[] {
  return [
    ...checkOwner(organisation, path),
    ...checkRepeatedMembers(organisation, path),
    ...organisation.members.flatMap((member, index) => [
      ...checkMemberLimits(organisation, member, [...path, "members", index]),
      ...checkMemberConcurrency(organisation, member, [...path, "members", index]),
    ]),
  ];
}

/** Without an owner nobody may manage the organisation. */
function checkOwner(organisation: Organisation, path: Path): KindCheckProblem[] {
  if (organisation.members.some((member) => member.role === "owner")) {
    return [];
  }
  return [
    {
      severity: "error",
      code: "users-organisation-owner-missing",
      path: [...path, "members"],
      message: `Organisation "${organisation.id}" needs at least one member with role "owner"`,
    },
  ];
}

/** A person listed twice would have two roles, so the second entry is refused. */
function checkRepeatedMembers(organisation: Organisation, path: Path): KindCheckProblem[] {
  const seen = new Set<string>();
  return organisation.members.flatMap((member, index) => {
    if (!seen.has(member.actor)) {
      seen.add(member.actor);
      return [];
    }
    return [
      {
        severity: "error" as const,
        code: "users-member-repeated",
        path: [...path, "members", index, "actor"],
        message: `Organisation "${organisation.id}" already has member "${member.actor}"`,
      },
    ];
  });
}

/**
 * A member's limit is a share of a pool limit on the same unit and period,
 * so there must be one, and the share can't be larger than the pool.
 */
function checkMemberLimits(
  organisation: Organisation,
  member: OrganisationMember,
  path: Path,
): KindCheckProblem[] {
  return (member.limits ?? []).flatMap((limit, index) => {
    const pool = organisation.limits.find(
      (candidate) => candidate.unit === limit.unit && candidate.period === limit.period,
    );
    const limitPath: Path = [...path, "limits", index];
    if (pool === undefined) {
      return [memberLimitOutsidePool(organisation, member, limit, limitPath)];
    }
    if (limit.amount <= pool.amount) {
      return [];
    }
    return [
      {
        severity: "error" as const,
        code: "users-member-limit-above-pool",
        path: [...limitPath, "amount"],
        message: `Member "${member.actor}" may use ${limit.amount} ${limit.unit} per ${limit.period}, more than organisation "${organisation.id}" has in all (${pool.amount})`,
      },
    ];
  });
}

/** The problem for a member's limit with no pool limit to share. */
function memberLimitOutsidePool(
  organisation: Organisation,
  member: OrganisationMember,
  limit: UsageLimit,
  path: Path,
): KindCheckProblem {
  const key = `${limit.unit} per ${limit.period}`;
  return {
    severity: "error",
    code: "users-member-limit-outside-pool",
    path,
    message: `Member "${member.actor}" has a limit on ${key}, but organisation "${organisation.id}" has none to share`,
  };
}

/** A member can't run more at once than the whole organisation may. */
function checkMemberConcurrency(
  organisation: Organisation,
  member: OrganisationMember,
  path: Path,
): KindCheckProblem[] {
  if (
    organisation.concurrency === undefined ||
    member.concurrency === undefined ||
    member.concurrency <= organisation.concurrency
  ) {
    return [];
  }
  return [
    {
      severity: "error",
      code: "users-member-concurrency-above-organisation",
      path: [...path, "concurrency"],
      message: `Member "${member.actor}" may have ${member.concurrency} runs at once, more than organisation "${organisation.id}" allows (${organisation.concurrency})`,
    },
  ];
}
