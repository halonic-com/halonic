import type { WorkspaceFolderProbe } from "@halonicjs/adapter-fs-tauri";
import { TauriDefinitionStore } from "@halonicjs/adapter-fs-tauri";
import type { CreatedSample, SampleHost } from "@halonicjs/studio-feature-workspace";
import { copyWorkspace } from "@halonicjs/workspace";
import {
  commands,
  madeFolder,
  type NewWorkspaceHostParts,
  probed,
  reasonOf,
  trustOf,
} from "./new-workspace-host.ts";
import { sampleSource } from "./sample-files.ts";

/** The folder name of the first copy; later copies are "Acme sample 2", "Acme sample 3", … */
const sampleName = "Acme sample";

/** How many copies it looks through before it says there is no room for another. */
const mostCopies = 99;

/**
 * The app's side of **Try the Acme sample** (flow-first-run 2.2): the first of `Acme sample`,
 * `Acme sample 2`, … that isn't in Documents yet, made through the shell, with the bundled
 * `examples/acme` copied in by `copyWorkspace` and trusted at once, since Halonic wrote every
 * file. It never writes into a folder that is there, and never asks where.
 *
 * @example
 * const host = sampleHostOf({ shell, trust, separator: "/" });
 * const made = await host.create();
 */
export function sampleHostOf(parts: NewWorkspaceHostParts): SampleHost {
  const storeOf = parts.storeOf ?? ((folder) => new TauriDefinitionStore(parts.shell, folder));
  return {
    create: async () => {
      let parent = "Documents";
      try {
        parent = await documentsOf(parts);
        const name = await freeName(parts, parent);
        const made = await madeFolder(parts.shell, parent, name);
        const copied = await copyWorkspace(sampleSource(), storeOf(made));
        if (!copied.ok) return cant(parent, "the folder isn't empty");
        return { kind: "created", folder: made, name, trust: await trustOf(parts, made, true) };
      } catch (reason) {
        return cant(parent, reasonOf(reason));
      }
    },
  };
}

/** The refusal Welcome shows: where it was meant to go and why it didn't. */
function cant(folder: string, reason: string): CreatedSample {
  return { kind: "cant", folder, reason };
}

/** Where Documents is; rejects when this computer has none. */
async function documentsOf(parts: NewWorkspaceHostParts): Promise<string> {
  const documents = await parts.shell.invoke(commands.documents);
  if (typeof documents !== "string") throw new Error("this computer has no Documents folder");
  return documents;
}

/** The first sample folder name that isn't there, by what the shell finds. */
async function freeName(parts: NewWorkspaceHostParts, parent: string): Promise<string> {
  for (let number = 1; number <= mostCopies; number += 1) {
    const name = number === 1 ? sampleName : `${sampleName} ${number}`;
    const found: WorkspaceFolderProbe = await probed(parts.shell, parent, name);
    if (found === "new") return name;
  }
  throw new Error(`there are already ${mostCopies} copies of the sample`);
}
