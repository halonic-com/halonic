// The files of a fence proof, in the folders of one box folder. The proof and
// the trust-check canary lay them out the same way, so the canary's probes
// find the same things the session's own proof does.
//
//   <box folder>\readable\   a folder the box may read:
//       control.txt            ... a file it can read (the allowed-folder control),
//       denied.txt             ... a file in `deniedPaths` inside that readable folder,
//       probe.cjs, probe.json  ... the probe program and its settings.
//   <box folder>\hidden\     a folder nothing grants:
//       canary.txt             ... a file the box can't read,
//       victim.txt             ... a file it can't change or remove.
//   <box folder>\temp, settings   the canary's own temp and settings folders.

import { randomBytes } from "node:crypto";
import { win32 } from "node:path";
import type { MxcDisk } from "./disk.ts";
import { leakProbeScript } from "./probe-scripts.ts";

/** Where each file of a proof is. */
export interface FenceFiles {
  folder: string;
  /** Read-only to the box. */
  readable: string;
  control: string;
  /** Denied, though its folder is readable. */
  denied: string;
  script: string;
  config: string;
  /** Granted to no one. */
  hidden: string;
  canary: string;
  victim: string;
  temp: string;
  settings: string;
}

/** What the victim file holds, so a change is seen. */
export const victimText = "original";

/** The paths of a proof inside `folder`, a box folder. */
export function fenceFiles(folder: string): FenceFiles {
  const inside = (...parts: string[]) => win32.join(folder, ...parts);
  return {
    folder,
    readable: inside("readable"),
    control: inside("readable", "control.txt"),
    denied: inside("readable", "denied.txt"),
    script: inside("readable", "probe.cjs"),
    config: inside("readable", "probe.json"),
    hidden: inside("hidden"),
    canary: inside("hidden", "canary.txt"),
    victim: inside("hidden", "victim.txt"),
    temp: inside("temp"),
    settings: inside("settings"),
  };
}

/** Makes the folders and writes the files of a proof, and the probe program. */
export async function writeFenceFiles(disk: MxcDisk, files: FenceFiles): Promise<void> {
  await disk.makeFolder(files.readable);
  await disk.makeFolder(files.hidden);
  await disk.writeText(files.control, "control");
  await disk.writeText(files.denied, randomBytes(16).toString("hex"));
  await disk.writeText(files.canary, randomBytes(16).toString("hex"));
  await disk.writeText(files.victim, victimText);
  await disk.writeText(files.script, leakProbeScript);
}
