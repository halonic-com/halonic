import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { UnfencedRunConsent, UnfencedRunConsentStore } from "@halonicjs/ports";
import { parse, s } from "@halonicjs/schema-kit";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";

/** The name of the one file that holds the yes, in the store's folder. */
const consentFile = "consent.json";

/**
 * What a saved yes must look like after `JSON.parse`: exactly a reason and
 * the time as text a `Date` can read (Liam, HAL-3385 follow-up 3). A file
 * with another shape, such as one edited by hand, is no yes.
 */
const savedConsent = s
  .object({
    reason: s.string().min(1),
    allowedAt: s.string().refine((text) => !Number.isNaN(Date.parse(text))),
  })
  .strict();

/**
 * The user's yes to run plugin and integration code without the sandbox, as
 * one JSON file in a folder of the user's profile, such as
 * `<profile>/unfenced-runs`. The folder must never be inside a workspace:
 * an agent that edits the workspace must not be able to give the yes.
 *
 * A save writes a temporary file and renames it over the yes, so a reader
 * sees the old yes or the new one, never half of one. A yes that isn't
 * JSON, or whose shape isn't exactly a reason and a time, can't be read:
 * `get` throws and the caller asks again. So does a yes that is a link,
 * such as one to a file in a workspace, a hard link or anything that isn't
 * a plain file. Only the file is checked, not the folder: a folder that is
 * itself a link is followed, which is safe only because it lives in the
 * profile.
 */
export class FileUnfencedRunConsentStore implements UnfencedRunConsentStore {
  readonly #root: string;
  readonly #file: string;

  /** @param root - the folder for the yes, such as `<profile>/unfenced-runs`; created on the first save */
  constructor(root: string) {
    this.#root = resolve(root);
    this.#file = join(this.#root, consentFile);
  }

  async get(): Promise<UnfencedRunConsent | null> {
    let text: string;
    try {
      text = await readUnlinkedFile(this.#file);
    } catch (error) {
      if (isMissing(error)) return null;
      // The file system's errors name the file, never what it holds.
      throw unreadable(this.#file, error);
    }
    return parseConsent(this.#file, text);
  }

  async save(consent: UnfencedRunConsent): Promise<void> {
    // Only the fields of a yes are written, so `get` can read it back.
    const { reason, allowedAt } = consent;
    const text = `${JSON.stringify({ reason, allowedAt }, null, 2)}\n`;
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
      await renameOver(temporary, this.#file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(): Promise<void> {
    // Deletes the file without reading it, so a damaged yes goes too.
    await rm(this.#file, { force: true });
  }
}

/**
 * Reads a yes, and refuses one that isn't exactly the shape `save` writes.
 * Neither error is passed on as the cause: the parser's message and the
 * schema's issues can quote the text that was read.
 */
function parseConsent(file: string, text: string): UnfencedRunConsent {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unreadable(file);
  }
  const consent = parse(savedConsent, value);
  if (!consent.ok) {
    throw unreadable(file);
  }
  return consent.value;
}

function unreadable(file: string, cause?: unknown): Error {
  return new Error(
    `The saved yes to run plugins and integrations without the sandbox can't be read (${JSON.stringify(file)}). Halonic will ask again.`,
    cause === undefined ? undefined : { cause },
  );
}
