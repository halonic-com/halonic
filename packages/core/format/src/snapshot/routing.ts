// The snapshot's routing (plan HAL-17450 rev 5, "Step 2" and "Safety"): who
// covers each role and who owns each area. It names agents only, by their
// url key: never a GitHub login, an email or a key. It decides who reviews,
// so it is a trust root: what it may hold is fixed here, and anything else
// is refused. The rules that pick a role (paths, sizes) stay in code; the
// routing only says which agent covers it.
import { type Infer, type Path, s } from "@halonicjs/schema-kit";
import { checkKeysIn, credentialName } from "../shared/key-in-value.ts";

/** The roles a routing may fill. Any other role is refused. */
export const ROUTING_ROLES = [
  "code-reviewer",
  "second-reviewer",
  "routine-reviewer",
  "clarifier",
  "merge-captain",
] as const;

/** A role a routing may fill. */
export type RoutingRole = (typeof ROUTING_ROLES)[number];

/**
 * An agent's url key, such as `liam`: a lowercase letter, then lowercase
 * letters, digits and `-`. An email (`@`), a bot login (`[bot]`) and most
 * key formats (`_`, capitals) don't fit.
 */
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** An area's name, such as `engine-and-cli`: the slug of its row in the area table. */
export const AREA_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** The most areas one routing names. */
export const MAX_ROUTING_AREAS = 50;

/** An area name that says it holds an account or a credential, not a part of the product. */
const accountWord = /login|e-?mail|account|user-?name/i;

const agent = s.string().regex(AGENT_NAME_PATTERN, "name an agent by its url key, such as 'liam'");

const areaName = s
  .string()
  .regex(AREA_NAME_PATTERN, "name the area by its slug, such as 'engine-and-cli'");

/** Who covers each role and who owns each area. */
export const Routing = s
  .object({
    roles: s
      .object({
        "code-reviewer": agent.optional(),
        "second-reviewer": agent.optional(),
        "routine-reviewer": agent.optional(),
        clarifier: agent.optional(),
        "merge-captain": agent.optional(),
      })
      .strict()
      .default({}),
    areas: s
      .record(areaName, agent)
      .refine(
        (areas) => Object.keys(areas).length <= MAX_ROUTING_AREAS,
        `name at most ${MAX_ROUTING_AREAS} areas`,
      )
      .default({}),
  })
  .strict();

/** Who covers each role and who owns each area. */
export type Routing = Infer<typeof Routing>;

/** A problem the routing's own checks find, beyond its schema. */
export interface RoutingProblem {
  readonly code: string;
  readonly path: Path;
  readonly message: string;
}

/**
 * The checks the schema can't express: an agent name that holds a key
 * (`value-looks-like-key`), and an area name that reads like an account
 * or credential field, such as `github-login` or `api-token`
 * (`routing-area-looks-like-account`). Messages never repeat the value.
 *
 * @param routing - a routing that passed the schema
 * @param path - where the routing sits in the snapshot
 */
export function checkRouting(routing: Routing, path: Path): RoutingProblem[] {
  const keys = (["roles", "areas"] as const).flatMap((list) =>
    checkKeysIn(routing[list], [...path, list], "setting"),
  );
  const accounts = Object.keys(routing.areas)
    .filter((area) => accountWord.test(area) || credentialName.test(area))
    .map((area) => ({
      code: "routing-area-looks-like-account",
      path: [...path, "areas", area],
      message: "name a part of the product here; logins, emails and keys don't belong in routing",
    }));
  return [...keys.map(({ code, path: at, message }) => ({ code, path: at, message })), ...accounts];
}
