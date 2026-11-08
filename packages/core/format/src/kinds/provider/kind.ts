import type { FileKind } from "../../kind.ts";
import { Provider } from "./schema.ts";

/** `providers/<id>.yaml` at the workspace root. */
export const providerKind: FileKind<Provider> = {
  name: "provider",
  about: "A connection to something that serves models.",
  syntax: "yaml",
  schema: Provider,
  places: [{ scope: "workspace", folder: "providers", name: "<id>.yaml" }],
  idFromPlace: "fallback",
};
