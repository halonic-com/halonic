import type { FileKind } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { Runtime } from "./schema.ts";

/** `runtimes/<id>.yaml` at the workspace root. */
export const runtimeKind: FileKind<Runtime> = {
  name: "runtime",
  about: "Where agents run: in the process, or another runtime adapter.",
  syntax: "yaml",
  schema: Runtime,
  places: [{ scope: "workspace", folder: "runtimes", name: "<id>.yaml" }],
  idFromPlace: "fallback",
  /** `options` takes any setting, so a key pasted there is caught here. */
  check: (runtime) => checkKeysIn(runtime.options, ["options"], "setting"),
};
