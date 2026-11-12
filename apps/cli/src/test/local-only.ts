import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Turns off `privacy.localOnly` in a copy of the Acme example, as a user
 * would before adding a remote connector or the Claude Code harness. Acme
 * starts local only (HAL-5922), so without this `halonic validate` finds
 * `local-only-connector`, and `run` refuses the workspace before trust
 * (HAL-6613).
 */
export async function turnOffLocalOnly(acme: string): Promise<void> {
  const file = join(acme, "workspace.yaml");
  const settings = await readFile(file, "utf8");
  if (!settings.includes("localOnly: true")) {
    throw new Error(`${file} no longer says localOnly: true`);
  }
  await writeFile(file, settings.replace("localOnly: true", "localOnly: false"));
}
