import type { WorkspaceFolderProbe } from "@halonicjs/adapter-fs-tauri";
import { TauriDefinitionStore } from "@halonicjs/adapter-fs-tauri";
import type { CreatedSample, SampleHost } from "@halonicjs/studio-feature-workspace";
import { errorKindOf } from "@halonicjs/std";
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

/** Where the copies go, as a person reads it on any computer (microcopy 3.2), never the full path. */
const documentsName = "~/Documents";

/** How many copies it looks through before it says there is no room for another. */
const mostCopies = 99;

/**
 * The app's side of **Try the Acme sample** (flow-first-run 2.2): the first of `Acme sample`,
 * `Acme sample 2`, … that isn't in Documents yet (or a sample the device already knows, which is
 * reopened instead), made through the shell, with the bundled
 * `examples/acme` copied in by `copyWorkspace` and trusted at once, since Halonic wrote every
 * file. It never writes into a folder that is there, and never asks where.
 *
 * @example
 * const host = sampleHostOf({ shell, trust, separator: "/" });
 * const made = await host.create(knownSamples);
 */
export function sampleHostOf(parts: NewWorkspaceHostParts): SampleHost {
  const storeOf = parts.storeOf ?? ((folder) => new TauriDefinitionStore(parts.shell, folder));
  return {
    create: async (known) => {
      try {
        const parent = await documentsOf(parts);
        const place = await freeName(parts, parent, known);
        if (place.kind === "known") return { kind: "existing", folder: place.folder };
        const { name } = place;
        const made = await madeFolder(parts.shell, parent, name);
        const copied = await copyWorkspace(sampleSource(), storeOf(made));
        if (!copied.ok) return cant("the folder isn't empty");
        return { kind: "created", folder: made, name, trust: await trustOf(parts, made, true) };
      } catch (reason) {
        return cant(reasonOf(reason), errorKindOf(reason) === "unavailable");
      }
    },
  };
}

/** The refusal Welcome shows: where it was meant to go, as the person knows it, and why it didn't;
 * `unavailable` when the shell gave no answer, which Welcome words itself and tries again first. */
function cant(reason: string, unavailable = false): CreatedSample {
  return {
    kind: "cant",
    folder: documentsName,
    reason,
    ...(unavailable ? { unavailable: true as const } : {}),
  };
}

/** Where Documents is; rejects when this computer has none. */
async function documentsOf(parts: NewWorkspaceHostParts): Promise<string> {
  const documents = await parts.shell.invoke(commands.documents);
  if (typeof documents !== "string") throw new Error("this computer has no Documents folder");
  return documents;
}

/** Where the sample goes: a sample folder the device knows, or the first name that isn't taken. */
type Place =
  | { readonly kind: "known"; readonly folder: string }
  | { readonly kind: "free"; readonly name: string };

/**
 * Walks `Acme sample`, `Acme sample 2`, … and stops at the first that is a known sample folder,
 * which is reopened, or that isn't there, which is made. Any other taken name is passed by.
 */
async function freeName(
  parts: NewWorkspaceHostParts,
  parent: string,
  known: readonly string[],
): Promise<Place> {
  for (let number = 1; number <= mostCopies; number += 1) {
    const name = number === 1 ? sampleName : `${sampleName} ${number}`;
    const found: WorkspaceFolderProbe = await probed(parts.shell, parent, name);
    if (found === "new") return { kind: "free", name };
    const folder = joined(parent, name, parts.separator);
    if (known.includes(folder)) return { kind: "known", folder };
  }
  throw new Error(`there are already ${mostCopies} copies of the sample`);
}

/** The folder's location as the shell gives it: the parent, a separator, the name. */
function joined(parent: string, name: string, separator: string): string {
  return parent.endsWith(separator) ? `${parent}${name}` : `${parent}${separator}${name}`;
}
