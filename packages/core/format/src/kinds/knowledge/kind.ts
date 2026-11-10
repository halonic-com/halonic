import type { FileKind } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { KnowledgeSource } from "./schema.ts";

/** `library/knowledge/<id>.yaml`, shared at the root or a hub's own. */
export const knowledgeKind: FileKind<KnowledgeSource> = {
  name: "knowledge",
  about: "A knowledge source agents can search, and with files also write notes to.",
  syntax: "yaml",
  schema: KnowledgeSource,
  places: [{ scope: "workspace-and-hub", folder: "library/knowledge", name: "<id>.yaml" }],
  idFromPlace: "fallback",
  /** `config` takes any setting, so a key pasted there is caught here. */
  check: (source) => checkKeysIn(source.config, ["config"], "setting"),
};
