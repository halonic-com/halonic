import { routesOf, type StepperCatalog, type StepperDefinition } from "@halonicjs/action-steppers";
import { catalogEntries } from "./catalog.generated.ts";

/** A shipped definition with the SHA-256 of its source file, which records carry (architecture note, 4.2). */
export interface CatalogEntry {
  /** Where it was found: `github/upload-social-preview` for `src/github/upload-social-preview.ts`. */
  key: string;
  definition: StepperDefinition;
  sourceHash: string;
}

/** Every definition `pnpm discover --fix` found under `src/<service>/`, sorted by key. */
export const shippedDefinitions: readonly CatalogEntry[] = Object.entries(catalogEntries).map(
  ([key, entry]) => ({ key, definition: entry.definition, sourceHash: entry.sourceHash }),
);

function findEntry(id: string, version: number): CatalogEntry | undefined {
  return shippedDefinitions.find(
    (entry) => entry.definition.id === id && entry.definition.version === version,
  );
}

/** The source hash of a shipped definition, or `undefined` when this Halonic has none of that id and version. */
export function sourceHashOf(id: string, version: number): string | undefined {
  return findEntry(id, version)?.sourceHash;
}

/**
 * The catalog shipped with this Halonic. It holds whole definitions only:
 * no step types and no browser origins yet, so a request can name a shipped
 * definition but can't build an on-demand stepper from blocks. A step's route
 * is built from its definition by `routesOf`, as the shell's generated route
 * list is, and the shell checks every send against its own list.
 */
export const shippedCatalog: StepperCatalog = {
  definition: (id, version) => findEntry(id, version)?.definition,
  stepType: () => undefined,
  browserOrigins: [],
  route: (id, version, step) => {
    const definition = findEntry(id, version)?.definition;
    if (definition === undefined) return undefined;
    return routesOf(definition).find((route) => route.step === step);
  },
};
