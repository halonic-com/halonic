import { posixPath } from "@halonicjs/std";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

/** The runtimes Halonic has. Every agent runs in the Halonic process, whatever a file says. */
const runtimes: readonly string[] = ["inprocess"];

/** The runtime Halonic uses when a file names one it doesn't have. */
const usedRuntime = "inprocess";

/**
 * `defaults.runtime` of the workspace or of a hub that names a runtime
 * Halonic doesn't have. The setting is ignored, so this is a warning: a
 * workspace that runs today still runs.
 */
export function checkDefaultRuntimes(context: CheckContext): WorkspaceIssue[] {
  const files = [...context.filesOf("workspace"), ...context.filesOf("hub")];
  return files.flatMap((file) => {
    const runtime = file.value.defaults.runtime;
    if (runtime === undefined || runtimes.includes(runtime)) {
      return [];
    }
    const message = `Runtime "${runtime}" isn't one Halonic has; it runs ${usedRuntime}. Remove defaults.runtime, or set it to ${usedRuntime}.`;
    return [
      context.issue("warning", file.path, ["defaults", "runtime"], "unknown-runtime", message),
    ];
  });
}

type Agent = LoadedFileOf<"agent">;

/** Instructions in an agent file: the agent's own or a method's, at their key path. */
interface InstructionsPlace {
  readonly path: WorkspaceIssue["path"];
  readonly text: string;
}

/**
 * Instructions that are only the name of a file in the workspace, such as
 * `instructions: ./announcer.md`. Halonic sends the text as it is, so the
 * agent quietly works without its instructions. Each is a warning: the
 * name could be meant as the text.
 */
export function checkInstructionFiles(context: CheckContext): WorkspaceIssue[] {
  return context.filesOf("agent").flatMap((agent) => {
    const places: InstructionsPlace[] = [
      { path: ["instructions"], text: agent.value.instructions },
      ...Object.entries(agent.value.methods).map(([id, method]) => ({
        path: ["methods", id, "instructions"],
        text: method.instructions,
      })),
    ];
    return places
      .filter((place) => namesFile(context, agent, place.text))
      .map(({ path, text }) => {
        const message = `instructions is the text "${text.trim()}". Paste the instructions here; Halonic doesn't read files from instructions.`;
        return context.issue("warning", agent.path, path, "instructions-file-name", message);
      });
  });
}

/**
 * Whether the whole text is one line that names a file in the workspace,
 * next to the agent's file or from the workspace's root.
 */
function namesFile(context: CheckContext, agent: Agent, text: string): boolean {
  const name = text.trim();
  if (name === "" || name.includes("\n")) {
    return false;
  }
  const nextToAgent = posixPath.join(posixPath.dirname(agent.path), name);
  return context.hasFile(nextToAgent) || context.hasFile(posixPath.normalize(name));
}
