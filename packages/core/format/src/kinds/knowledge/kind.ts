import type { FileKind } from "../../kind.ts";
import { KnowledgeSource } from "./schema.ts";

/** `library/knowledge/<id>.yaml`, shared at the root or a hub's own. */
export const knowledgeKind: FileKind<KnowledgeSource> = {
  name: "knowledge",
  about: "A knowledge source agents can search, and with files also write notes to.",
  syntax: "yaml",
  schema: KnowledgeSource,
  places: [{ scope: "workspace-and-hub", folder: "library/knowledge", name: "<id>.yaml" }],
  idFromPlace: "fallback",
};
