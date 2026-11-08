import type { FileKind } from "../../kind.ts";
import { Runtime } from "./schema.ts";

/** `runtimes/<id>.yaml` at the workspace root. */
export const runtimeKind: FileKind<Runtime> = {
  name: "runtime",
  about: "Where agents run: in the process, or another runtime adapter.",
  syntax: "yaml",
  schema: Runtime,
  places: [{ scope: "workspace", folder: "runtimes", name: "<id>.yaml" }],
  idFromPlace: "fallback",
};
