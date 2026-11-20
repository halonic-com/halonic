import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  makePrivateFolder,
  readUnlinkedFile,
  renameOver,
  writeFlushedFile,
} from "@halonicjs/adapter-fs-node";

/** One small text file the remote host keeps in the person's profile. */
export interface PrivateFile {
  /** Its text, or `undefined` when there is no file yet. */
  read(): Promise<string | undefined>;
  /** Replaces its text, so a reader finds the old text or the new, never half of it. */
  write(text: string): Promise<void>;
}

/**
 * A {@link PrivateFile} at `file`, in a folder only the person may open, as
 * the profile's other stores keep theirs: a link in the file's place is
 * refused, and a write goes to a flushed temporary file renamed over it.
 */
export function privateFileAt(file: string): PrivateFile {
  return {
    read: async () => {
      try {
        return await readUnlinkedFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
    write: async (text) => {
      const temporary = `${file}.${randomUUID()}.tmp`;
      await makePrivateFolder(dirname(file));
      try {
        await writeFlushedFile(temporary, text, { mode: 0o600 });
        await renameOver(temporary, file);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
}
