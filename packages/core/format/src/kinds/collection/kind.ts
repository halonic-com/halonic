import type { FileKind } from "../../kind.ts";
import { Collection } from "./schema.ts";

/**
 * `library/collections/<id>.collection.yaml` at the workspace root. Checking
 * and folding records is runtime work for the records service, not part of
 * the file format.
 */
export const collectionKind: FileKind<Collection> = {
  name: "collection",
  about: "A typed list of records agents read and write, with views and seed records.",
  syntax: "yaml",
  schema: Collection,
  places: [{ scope: "workspace", folder: "library/collections", name: "<id>.collection.yaml" }],
  idFromPlace: "fallback",
};
