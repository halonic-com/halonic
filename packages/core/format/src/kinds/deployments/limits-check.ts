import type { KindCheckProblem } from "../../kind.ts";
import type { UsageLimit } from "./users.ts";

/**
 * Refuses the second limit on a unit and period already in `limits`: two
 * would leave it unclear which one holds. `owner` names whose list it is in
 * the message, for example `Deployment "web"` or `Member "eu_…"`.
 */
export function checkRepeatedLimits(
  limits: readonly UsageLimit[],
  path: KindCheckProblem["path"],
  owner: string,
): KindCheckProblem[] {
  const seen = new Set<string>();
  return limits.flatMap((limit, index) => {
    const key = `${limit.unit} per ${limit.period}`;
    if (!seen.has(key)) {
      seen.add(key);
      return [];
    }
    return [
      {
        severity: "error" as const,
        code: "users-limit-repeated",
        path: [...path, index],
        message: `${owner} already has a limit on ${key}`,
      },
    ];
  });
}
