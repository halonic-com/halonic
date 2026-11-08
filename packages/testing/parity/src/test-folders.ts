import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Temporary folders for tests, each removed by `cleanUp` (plan 9.3 point 8). */
export class TestFolders {
  readonly #made: string[] = [];

  /** A new empty folder. */
  make(): string {
    const folder = mkdtempSync(join(tmpdir(), "parity-test-"));
    this.#made.push(folder);
    return folder;
  }

  /** Writes files (path → text) under a folder, creating sub-folders. */
  write(folder: string, files: Readonly<Record<string, string>>): void {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, path)), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
  }

  cleanUp(): void {
    for (const folder of this.#made.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}
