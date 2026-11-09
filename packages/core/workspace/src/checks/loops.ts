/**
 * The loops in a graph of named items, such as agents that delegate to each
 * other. Each loop is given once, as the path from its first item (in the
 * order of `ids`) back to that item: `["checker", "reviewer", "checker"]`.
 * An item that names itself is not a loop here; the checks report it on its
 * own. Names that aren't among `ids` are left out.
 *
 * The old loader reported a loop this way: for each item in order, it looked
 * for a way back to that item and reported the first one, unless the same
 * items already made up a loop it had reported.
 *
 * @param ids - every item, in the order the loops are looked for
 * @param next - the items one item names
 */
export function findLoops(
  ids: readonly string[],
  next: (id: string) => readonly string[],
): string[][] {
  const known = new Set(ids);
  const reported = new Set<string>();
  const loops: string[][] = [];
  for (const start of ids) {
    const loop = wayBack(start, (id) => next(id).filter((to) => to !== id && known.has(to)));
    if (loop === undefined) {
      continue;
    }
    const members = [...new Set(loop)].sort().join("\n");
    if (!reported.has(members)) {
      reported.add(members);
      loops.push(loop);
    }
  }
  return loops;
}

/** The first path, depth first, from `start` back to `start`; `undefined` when there is none. */
function wayBack(start: string, next: (id: string) => readonly string[]): string[] | undefined {
  const visited = new Set<string>();
  const path: string[] = [start];
  const search = (id: string): boolean => {
    for (const to of next(id)) {
      if (to === start) {
        path.push(to);
        return true;
      }
      if (visited.has(to)) {
        continue;
      }
      visited.add(to);
      path.push(to);
      if (search(to)) {
        return true;
      }
      path.pop();
    }
    return false;
  };
  return search(start) ? path : undefined;
}
