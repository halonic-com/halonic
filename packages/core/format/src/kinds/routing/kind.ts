import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkRouting, Routing } from "../../snapshot/routing.ts";

/** The largest `routing.yaml` read: 4 roles and 50 areas fit in well under this. */
export const MAX_ROUTING_FILE_BYTES = 16 * 1024;

/**
 * `routing.yaml` at the workspace root: who covers each review role and who
 * owns each area, for the plugin built from the workspace. It is the
 * snapshot's `routing` part as a file, so it is refused for the same
 * reasons: an unknown role or field, a name that isn't an agent's url key,
 * a key in a name, or an area named like an account.
 */
export const routingKind: FileKind<Routing> = {
  name: "routing",
  about: "Who covers each review role and who owns each area, by agent url key.",
  syntax: "yaml",
  schema: Routing,
  places: [{ scope: "workspace", folder: "", name: "routing.yaml" }],
  idFromPlace: "none",
  maxBytes: MAX_ROUTING_FILE_BYTES,
  check: (routing) =>
    checkRouting(routing, []).map(
      ({ code, path, message }): KindCheckProblem => ({ severity: "error", code, path, message }),
    ),
};
