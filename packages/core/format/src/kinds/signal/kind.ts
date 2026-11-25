import type { FileKind } from "../../kind.ts";
import { checkSignal } from "./checks.ts";
import { MAX_SIGNAL_FILE_BYTES, Signal } from "./schema.ts";

/**
 * `library/signals/<id>.signal.yaml`, at the workspace root only: a plugin
 * is built for a whole workspace, so its signals are the workspace's.
 */
export const signalKind: FileKind<Signal> = {
  name: "signal",
  about:
    "A signal the workspace switches on in a built plugin: one of the runtime's rules, its settings and whether it only logs.",
  syntax: "yaml",
  schema: Signal,
  places: [{ scope: "workspace", folder: "library/signals", name: "<id>.signal.yaml" }],
  idFromPlace: "fallback",
  maxBytes: MAX_SIGNAL_FILE_BYTES,
  check: checkSignal,
};
