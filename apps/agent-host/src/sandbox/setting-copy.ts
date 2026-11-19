import type { Readable } from "node:stream";
import { isSandboxSetting } from "@halonicjs/ports";
import { profileSandboxSettings } from "./choice-host.ts";

/**
 * The most a copied choice may be. A real one is under 150 bytes; more is
 * refused before it is read to the end.
 */
export const COPY_LIMIT = 4096;

/** What a copy or a removal answers, printed as one JSON line. */
export type CopyAnswer = { ok: true } | { ok: false; reason: string };

/**
 * Saves the choice on `input` as the person's choice in `profileFolder`
 * (HAL-13319). Studio's shell runs this in Halonic's WSL distro, as the
 * `halonic` user, so the distro's host reads the same choice as Windows,
 * where the real one stays: the distro never reads the Windows profile.
 * The choice comes on standard input, never on the command line, and is
 * checked here again with `isSandboxSetting`. The store writes a temporary
 * file and renames it, so the distro's host never reads half a choice.
 */
export async function copySandboxSetting(
  input: Readable,
  profileFolder: string,
): Promise<CopyAnswer> {
  const text = await readUpTo(input, COPY_LIMIT);
  if (text === undefined) return refused(`The choice is longer than ${COPY_LIMIT} bytes.`);
  let setting: unknown;
  try {
    setting = JSON.parse(text);
  } catch {
    return refused("The choice isn't JSON.");
  }
  if (!isSandboxSetting(setting)) return refused("The choice isn't a valid sandbox choice.");
  return outcome(() => profileSandboxSettings(profileFolder).save(setting));
}

/** Removes the copy of the choice in `profileFolder`, as the shell does when the person's choice is removed. */
export function removeSandboxSettingCopy(profileFolder: string): Promise<CopyAnswer> {
  return outcome(() => profileSandboxSettings(profileFolder).remove());
}

async function outcome(step: () => Promise<void>): Promise<CopyAnswer> {
  try {
    await step();
    return { ok: true };
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error));
  }
}

function refused(reason: string): CopyAnswer {
  return { ok: false, reason };
}

/** All of `input` as UTF-8, or `undefined` once it is longer than `limit` bytes. */
async function readUpTo(input: Readable, limit: number): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    length += bytes.length;
    if (length > limit) {
      input.destroy();
      return undefined;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}
