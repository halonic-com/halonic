import { Routine } from "@halonicjs/format/routine";
import type { DefinitionSource } from "@halonicjs/ports";
import { type Infer, parse, s } from "@halonicjs/schema-kit";
import { DefinitionSnapshotError } from "./definition-snapshot.ts";

/**
 * Where the snapshot keeps its routine index, among the workspace files. It is
 * written by `halonic deploy`, so the Worker finds the routines a webhook can
 * start without reading YAML. A workspace file can't have this path.
 */
export const routineIndexPath = "routines.index.json";

/** A routine and the hub its file sits in, `null` at the workspace root: the shape of `PlacedRoutine` in `@halonicjs/routines`. */
const placedRoutine = s.object({ hub: s.string().min(1).nullable(), routine: Routine }).strict();

const routineIndex = s.array(placedRoutine);

/** One entry of the routine index. */
export type IndexedRoutine = Infer<typeof placedRoutine>;

/** The text of the routine index: the placed routines the YAML files of the same workspace hold. */
export function formatRoutineIndex(routines: readonly IndexedRoutine[]): string {
  return JSON.stringify(routines);
}

/**
 * The routines the deployed snapshot holds, read from its routine index. The
 * index is checked against the routine schema, so a damaged one fails loudly.
 *
 * @throws DefinitionSnapshotError when the snapshot has no index or it isn't valid
 */
export async function readRoutineIndex(source: DefinitionSource): Promise<IndexedRoutine[]> {
  const text = await source.read(routineIndexPath);
  if (text === null) {
    throw new DefinitionSnapshotError(
      "The snapshot has no routine index. Run `halonic deploy` again.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DefinitionSnapshotError("The snapshot's routine index isn't valid JSON.");
  }
  const parsed = parse(routineIndex, json);
  if (!parsed.ok) {
    const [first] = parsed.error;
    throw new DefinitionSnapshotError(
      `The snapshot's routine index isn't in the expected shape: ${first?.path.join(".") ?? ""} ${first?.message ?? ""}`.trim(),
    );
  }
  return parsed.value;
}
