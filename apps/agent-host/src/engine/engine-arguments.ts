// The engine role's command line (B1, design note D1): exactly
// `--engine --profile-folder <folder> --workspace <folder>`, both folders
// absolute. Nothing else is read from argv or the environment: secrets,
// tokens and origins come over the control pipe, and the profile folder is
// the one Studio's shell names, never `HALONIC_HOME`.
import { isAbsolute } from "node:path";

/** What the engine role starts with. */
export interface EngineArguments {
  readonly profileFolder: string;
  readonly workspace: string;
}

/** Why the engine role refuses its command line, as a line for standard error. */
export interface EngineArgumentsRefusal {
  readonly error: string;
}

const valued = new Set(["--profile-folder", "--workspace"]);

/**
 * Reads `--engine --profile-folder <folder> --workspace <folder>`, in any
 * order. Any other argument, a repeated one or a folder that isn't absolute
 * is refused, so a typo can't start an engine on some other folder.
 */
export function engineArgumentsOf(
  args: readonly string[],
): EngineArguments | EngineArgumentsRefusal {
  const values = new Map<string, string>();
  let engine = false;
  for (let at = 0; at < args.length; at += 1) {
    const name = args[at] ?? "";
    if (name === "--engine" && !engine) {
      engine = true;
      continue;
    }
    const value = args[at + 1];
    if (!valued.has(name) || values.has(name) || value === undefined) {
      return refusal();
    }
    values.set(name, value);
    at += 1;
  }
  const profileFolder = values.get("--profile-folder");
  const workspace = values.get("--workspace");
  if (!engine || profileFolder === undefined || workspace === undefined) return refusal();
  if (!isAbsolute(profileFolder) || !isAbsolute(workspace)) return refusal();
  return { profileFolder, workspace };
}

function refusal(): EngineArgumentsRefusal {
  return {
    error:
      "The engine needs exactly --engine --profile-folder <folder> --workspace <folder>, with absolute folders.\n",
  };
}
