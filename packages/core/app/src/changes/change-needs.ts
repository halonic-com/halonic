import type { ChangeLine } from "./revert-parts.ts";

/**
 * Joins lines that need each other, directly or through others, into one
 * line, so no line waits on itself: two changes that can only go together
 * are one change ("a step and the wire to it are one line"). The joined line
 * keeps the first line's id and place, takes every part, and joins the
 * sentences with "; ". Needs on a joined line point at its new id.
 *
 * @example
 * joinLinesThatNeedEachOther([
 *   { id: "step:a", sentence: "Step added: A", parts: [["states", "a"]], needs: ["step:b"] },
 *   { id: "step:b", sentence: "Step added: B", parts: [["states", "b"]], needs: ["step:a"] },
 * ]);
 * // [{ id: "step:a", sentence: "Step added: A; Step added: B", parts: [["states", "a"], ["states", "b"]] }]
 */
export function joinLinesThatNeedEachOther(lines: readonly ChangeLine[]): ChangeLine[] {
  const groupOf = groupsOf(lines);
  return lines
    .filter((line) => groupOf.get(line.id) === line.id)
    .map((first) =>
      joinedLine(
        first.id,
        lines.filter((line) => groupOf.get(line.id) === first.id),
        groupOf,
      ),
    );
}

/** For each line's id, the id of the first line of the group of lines that need each other. */
function groupsOf(lines: readonly ChangeLine[]): Map<string, string> {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const groupOf = new Map<string, string>();
  for (const line of lines) {
    if (groupOf.has(line.id)) {
      continue;
    }
    groupOf.set(line.id, line.id);
    for (const other of reachableFrom(line.id, byId)) {
      if (!groupOf.has(other) && reachableFrom(other, byId).has(line.id)) {
        groupOf.set(other, line.id);
      }
    }
  }
  return groupOf;
}

function joinedLine(
  id: string,
  members: readonly ChangeLine[],
  groupOf: ReadonlyMap<string, string>,
): ChangeLine {
  const needs = new Set(
    members
      .flatMap((member) => member.needs ?? [])
      .map((needed) => groupOf.get(needed))
      .filter((group): group is string => group !== undefined && group !== id),
  );
  return {
    id,
    sentence: members.map((member) => member.sentence).join("; "),
    ...(members.some((member) => member.important === true) ? { important: true } : {}),
    parts: members.flatMap((member) => member.parts),
    ...(needs.size > 0 ? { needs: [...needs] } : {}),
  };
}

/** The ids `start` needs, directly or through other lines; only ids of lines that exist. */
function reachableFrom(start: string, byId: ReadonlyMap<string, ChangeLine>): Set<string> {
  const seen = new Set<string>();
  const toVisit = [...(byId.get(start)?.needs ?? [])];
  while (toVisit.length > 0) {
    const id = toVisit.pop() as string;
    if (seen.has(id) || !byId.has(id)) {
      continue;
    }
    seen.add(id);
    toVisit.push(...(byId.get(id)?.needs ?? []));
  }
  return seen;
}
