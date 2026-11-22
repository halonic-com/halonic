import type { DefinitionSource } from "@halonicjs/ports";
import { parse, s } from "@halonicjs/schema-kit";
import type { HubDefinitions } from "@halonicjs/workspace";
import { DefinitionSnapshotError } from "./definition-snapshot.ts";

/**
 * Where the snapshot keeps its run-definitions index, among the workspace
 * files. It is written by `halonic deploy`, so the Worker finds what a run
 * starts with without reading YAML. A workspace file can't have this path.
 */
export const runDefinitionsIndexPath = "run-definitions.index.json";

/**
 * The format of the index this Halonic writes and reads. A change to its
 * shape raises it, so a Worker built before the change refuses the newer
 * index plainly instead of misreading it.
 */
export const runDefinitionsIndexFormat = 1;

/** Each hub's definitions by hub id: what `definitionsOf` of `@halonicjs/workspace` gives. */
export type IndexedHubs = Readonly<Record<string, HubDefinitions>>;

const formatField = s.object({ format: s.number().int() });

/**
 * The envelope and the part of each hub a run looks up by. The rest of a
 * hub is what the deployer's loader built from files that parsed, and the
 * manifest hash the definition source checks on every read keeps it as it
 * was written, so it isn't checked again against the YAML kinds here: the
 * Worker has no YAML parser, and their schemas would bring it in.
 */
const indexShape = s
  .object({
    format: s.literal(runDefinitionsIndexFormat),
    hubs: s.record(
      s.string(),
      s.object({
        hubId: s.string().min(1),
        workflows: s.record(s.string(), s.unknown()),
        agents: s.record(s.string(), s.unknown()),
      }),
    ),
  })
  .strict();

/** The text of the run-definitions index: each hub's definitions, in the current format. */
export function formatRunDefinitionsIndex(hubs: IndexedHubs): string {
  return JSON.stringify({ format: runDefinitionsIndexFormat, hubs });
}

/**
 * Each hub's definitions, read from the deployed snapshot's run-definitions
 * index: the workflows and agents a run starts with, and the rest of what
 * `definitionsOf` gives for the hub. An index in a format this Halonic
 * doesn't know is refused, never guessed at.
 *
 * @throws DefinitionSnapshotError when the snapshot has no index, the index
 *   isn't JSON, is in another format, or doesn't fit its shape
 *
 * @example
 * const hubs = await readRunDefinitionsIndex(runtime.definitions);
 * const workflow = hubs["acme"]?.workflows["handle-order"];
 */
export async function readRunDefinitionsIndex(source: DefinitionSource): Promise<IndexedHubs> {
  const text = await source.read(runDefinitionsIndexPath);
  if (text === null) {
    throw new DefinitionSnapshotError(
      "The snapshot has no run-definitions index. Run `halonic deploy` again.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DefinitionSnapshotError("The snapshot's run-definitions index isn't valid JSON.");
  }
  checkFormat(json);
  const parsed = parse(indexShape, json);
  if (!parsed.ok) {
    const [first] = parsed.error;
    throw new DefinitionSnapshotError(
      `The snapshot's run-definitions index isn't in the expected shape: ${first?.path.join(".") ?? ""} ${first?.message ?? ""}`.trim(),
    );
  }
  for (const [hubId, hub] of Object.entries(parsed.value.hubs)) {
    if (hub.hubId !== hubId) {
      throw new DefinitionSnapshotError(
        `The snapshot's run-definitions index files hub "${hub.hubId}" under "${hubId}".`,
      );
    }
  }
  // The shape above checked the envelope; the hubs are the deployer's own, as written.
  return (json as { readonly hubs: IndexedHubs }).hubs;
}

/**
 * Refuses an index in a format other than {@link runDefinitionsIndexFormat}
 * before its shape is read, so a newer index says what to do about it.
 */
function checkFormat(json: unknown): void {
  const parsed = parse(formatField, json);
  if (!parsed.ok) {
    throw new DefinitionSnapshotError("The snapshot's run-definitions index has no format.");
  }
  const { format } = parsed.value;
  if (format > runDefinitionsIndexFormat) {
    throw new DefinitionSnapshotError(
      `The snapshot's run-definitions index is in format ${format}, newer than this Worker reads (${runDefinitionsIndexFormat}). Update Halonic and run \`halonic deploy\` again.`,
    );
  }
  if (format < runDefinitionsIndexFormat) {
    throw new DefinitionSnapshotError(
      `The snapshot's run-definitions index is in format ${format}, which this Worker no longer reads. Run \`halonic deploy\` again.`,
    );
  }
}
