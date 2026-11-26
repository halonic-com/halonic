import type { WorkspaceFolderProbe } from "@halonicjs/adapter-fs-tauri";
import { TauriDefinitionStore } from "@halonicjs/adapter-fs-tauri";
import { errorKindOf } from "@halonicjs/std";
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

/** The folder name of the first copy; later copies are "Acme demo 2", "Acme demo 3", … */
const demoName = "Acme demo";

/** The name copies had before the demo was called the demo (HAL-19402): only reopened, never made. */
const legacyName = "Acme sample";

/** Where the copies go, the same word on every computer (microcopy 3.2, HAL-12891), never a path. */
const documentsName = "Documents";

/** How many copies it looks through before it says there is no room for another. */
const mostCopies = 99;

/**
 * The app's side of **Open demo** (flow-first-run 2.2, first-run-flow 3.2): the first of `Acme demo`,
 * `Acme demo 2`, … that isn't in Documents yet (or a demo the device already knows, under that name
 * or the older `Acme sample`, which is reopened instead), made through the shell, with the bundled
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
      // Once the folder is made, trying again would make a second copy, so a failure from then on
      // is never `unavailable`.
      let written = false;
      try {
        const parent = await documentsOf(parts);
        const place =
          (await knownLegacy(parts, parent, known)) ?? (await freeName(parts, parent, known));
        if (place.kind === "known") return { kind: "existing", folder: place.folder };
        const { name } = place;
        const made = await madeFolder(parts.shell, parent, name);
        written = true;
        const copied = await copyWorkspace(sampleSource(), storeOf(made));
        if (!copied.ok) return cant("the folder isn't empty");
        return { kind: "created", folder: made, name, trust: await trustOf(parts, made, true) };
      } catch (reason) {
        return cant(reasonOf(reason), !written && errorKindOf(reason) === "unavailable");
      }
    },
  };
}

/** The refusal Welcome shows: where it was meant to go, as the person knows it, and why it didn't;
 * `unavailable` when the shell gave no answer before anything was written, which Welcome words
 * itself and tries again first. */
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

/** Where the demo goes: a demo folder the device knows, or the first name that isn't taken. */
type Place =
  | { readonly kind: "known"; readonly folder: string }
  | { readonly kind: "free"; readonly name: string };

/** The `number`th name of a series: `Acme demo`, `Acme demo 2`, … */
function nameOf(series: string, number: number): string {
  return number === 1 ? series : `${series} ${number}`;
}

/**
 * Looks through `Acme sample`, `Acme sample 2`, … only for a demo the device made before the rename
 * (HAL-19402), so it opens again instead of getting a second copy. It asks the shell only about names
 * the device knows, and never makes a folder under the old name.
 */
async function knownLegacy(
  parts: NewWorkspaceHostParts,
  parent: string,
  known: readonly string[],
): Promise<Place | undefined> {
  for (let number = 1; number <= mostCopies; number += 1) {
    const name = nameOf(legacyName, number);
    const folder = joined(parent, name, parts.separator);
    if (!known.includes(folder)) continue;
    const found: WorkspaceFolderProbe = await probed(parts.shell, parent, name);
    if (found !== "new") return { kind: "known", folder };
  }
  return undefined;
}

/**
 * Walks `Acme demo`, `Acme demo 2`, … and stops at the first that is a known demo folder,
 * which is reopened, or that isn't there, which is made. Any other taken name is passed by.
 */
async function freeName(
  parts: NewWorkspaceHostParts,
  parent: string,
  known: readonly string[],
): Promise<Place> {
  for (let number = 1; number <= mostCopies; number += 1) {
    const name = nameOf(demoName, number);
    const found: WorkspaceFolderProbe = await probed(parts.shell, parent, name);
    if (found === "new") return { kind: "free", name };
    const folder = joined(parent, name, parts.separator);
    if (known.includes(folder)) return { kind: "known", folder };
  }
  throw new Error(`there are already ${mostCopies} copies of the demo`);
}

/** The folder's location as the shell gives it: the parent, a separator, the name. */
function joined(parent: string, name: string, separator: string): string {
  return parent.endsWith(separator) ? `${parent}${name}` : `${parent}${separator}${name}`;
}
